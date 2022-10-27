// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {isIP} from 'is-ip';
import * as React from 'react';
import {useEffect, useState} from 'react';
import BusinessIcon from '@mui/icons-material/Business';
import HomeIcon from '@mui/icons-material/Home';
import CheckIcon from '@mui/icons-material/Check';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import SentimentDissatisfiedIcon from '@mui/icons-material/SentimentDissatisfied';
import {
  StepLabel,
  Stepper,
  Step,
  ToggleButtonGroup,
  ToggleButton,
  Button,
  Box,
  FormControl,
  TextField,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Stack,
  FormHelperText,
  InputLabel,
  Tabs,
  Tab,
  CircularProgress,
  Container,
  Checkbox,
  FormControlLabel,
} from '@mui/material';
import * as colors from '@mui/material/colors';
import TabPanel from '@mui/lab/TabPanel';
import isValidHostname from 'is-valid-hostname';
import {TabContext} from '@mui/lab';
import * as model from '../../../../../src/features/chromiumos/device_management/owned/add_owned_device_model';
import * as ReactPanelHelper from '../../../react/common/react_panel_helper';

const STEP_CONTENT_HEIGHT = '24em';
const DEFAULT_PORT = 2222;

const vscodeApi = acquireVsCodeApi();

ReactPanelHelper.receiveInitialData<model.AddOwnedDeviceViewContext>(
  vscodeApi
).then(context => {
  ReactPanelHelper.createAndRenderRoot(
    <AddOwnedDeviceView context={context} />
  );
});

const centerStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

type Step = {
  readonly label: string;
  readonly content: React.ReactElement;
};

type StepProps = {
  readonly setNextStepEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  readonly setBackEnabled: React.Dispatch<React.SetStateAction<boolean>>;
};

type AddOwnedDeviceStepProps = StepProps & {
  readonly context: model.AddOwnedDeviceViewContext;
  readonly connectionConfig: model.DutConnectionConfig;
  readonly setConnectionConfig: (newConfig: model.DutConnectionConfig) => void;
};

export function AddOwnedDeviceView(props: {
  context: model.AddOwnedDeviceViewContext;
}) {
  const context = props.context;

  const [activeStep, setActiveStep] = useState(0);
  const [nextStepEnabled, setNextStepEnabled] = useState(false);
  const [backEnabled, setBackEnabled] = useState(true);

  const [connectionConfig, setConnectionConfig] =
    useState<model.DutConnectionConfig>({
      networkType: model.DutNetworkType.OFFICE,
      ipAddress: '',
      forwardedPort: DEFAULT_PORT,
      hostname: '',
      addToSshConfig: true,
      addToHostsFile: true,
    });

  const handleBack = () => {
    if (activeStep >= 0) {
      setActiveStep(activeStep - 1);
    }
  };
  const handleNext = () => {
    if (nextStepEnabled) {
      if (activeStep === steps.length - 1) {
        vscodeApi.postMessage({
          command: 'finish',
          data: connectionConfig,
        });
        return;
      }
      if (activeStep < steps.length - 1) {
        setActiveStep(activeStep + 1);
      }
    }
  };
  const handleConnectionConfigChange = (
    newConfig: model.DutConnectionConfig
  ) => {
    setConnectionConfig(newConfig);
  };

  const stepProps: AddOwnedDeviceStepProps = {
    connectionConfig: connectionConfig,
    context: context,
    setConnectionConfig: handleConnectionConfigChange,
    setNextStepEnabled: setNextStepEnabled,
    setBackEnabled: setBackEnabled,
  };
  const handleKeydown = (e: any) => {
    console.log('keydown e.key = ' + e.key);
    if (
      nextStepEnabled &&
      (e.key === 'Enter' ||
        (e.getModifierState('Alt') && e.key === 'ArrowRight'))
    ) {
      handleNext();
    } else if (
      backEnabled &&
      e.getModifierState('Alt') &&
      e.key === 'ArrowLeft'
    ) {
      handleBack();
    }
  };

  const networkTypeStep: Step = {
    label: 'Network Type',
    content: <NetworkTypeStep {...stepProps} />,
  };
  const ipAddressStep: Step = {
    label: 'IP Address',
    content: <IpAddressStep {...stepProps} />,
  };
  const portForwardingInsStep: Step = {
    label: 'Port Forwarding',
    content: <PortForwardingStep {...stepProps} />,
  };
  const hostnameStep: Step = {
    label: 'Host Name',
    content: <HostNameStep {...stepProps} />,
  };
  const connectionTestStep: Step = {
    label: 'Test',
    content: <ConnectionTestStep {...stepProps} />,
  };

  const stepsByNetworkType = {
    [model.DutNetworkType.OFFICE]: [
      networkTypeStep,
      ipAddressStep,
      hostnameStep,
      connectionTestStep,
    ],
    [model.DutNetworkType.HOME]: [
      networkTypeStep,
      portForwardingInsStep,
      hostnameStep,
      connectionTestStep,
    ],
    [model.DutNetworkType.P2P]: [
      networkTypeStep,
      portForwardingInsStep,
      hostnameStep,
      connectionTestStep,
    ],
  };

  const steps = stepsByNetworkType[connectionConfig.networkType];

  return (
    <div tabIndex={-1} onKeyDown={handleKeydown}>
      <Container maxWidth="md">
        <Stack spacing={2}>
          <Stepper activeStep={activeStep}>
            {steps.map((step: Step) => (
              <Step key={step.label}>
                <StepLabel>{step.label}</StepLabel>
              </Step>
            ))}
          </Stepper>

          <Box sx={{height: STEP_CONTENT_HEIGHT}} style={centerStyle}>
            {steps[activeStep].content}
          </Box>

          <Box sx={{display: 'flex', flexDirection: 'row', pt: 2}}>
            <Button
              color="inherit"
              disabled={activeStep === 0 || !backEnabled}
              onClick={handleBack}
              sx={{mr: 1}}
            >
              Back
            </Button>
            <Box sx={{flex: '1 1 auto'}} />
            <Button onClick={handleNext} disabled={!nextStepEnabled}>
              {activeStep === steps.length - 1 ? 'Finish' : 'Next'}
            </Button>
          </Box>
        </Stack>
      </Container>
    </div>
  );
}

function NetworkTypeStep(props: AddOwnedDeviceStepProps) {
  const isNextStepEnabled = props.connectionConfig.networkType !== null;
  useEffect(() => {
    props.setNextStepEnabled(isNextStepEnabled);
  });
  const handleNetworkType = (nt: model.DutNetworkType) => {
    props.setConnectionConfig({...props.connectionConfig, networkType: nt});
  };
  const handleKeydown = (e: any) => {
    if (e.key === 'o') {
      handleNetworkType(model.DutNetworkType.OFFICE);
    } else if (e.key === 'h') {
      handleNetworkType(model.DutNetworkType.HOME);
    }
  };
  return (
    <div tabIndex={-1} onKeyDown={handleKeydown} ref={elem => elem?.focus()}>
      <p>Where is your DUT (device under test)?</p>
      <ToggleButtonGroup
        exclusive
        value={props.connectionConfig.networkType}
        onChange={(_e, v) => {
          if (v !== null) {
            handleNetworkType(v);
          }
        }}
      >
        <ToggleButton
          value={model.DutNetworkType.OFFICE}
          title="Your DUT (device under test) is connected to the office lab network"
        >
          <BusinessIcon />
          Office
        </ToggleButton>

        <ToggleButton
          value={model.DutNetworkType.HOME}
          title="Your DUT (device under test) is connected to a remote network such as a home network"
        >
          <HomeIcon />
          Home
        </ToggleButton>
      </ToggleButtonGroup>
    </div>
  );
}

function IpAddressStep(props: AddOwnedDeviceStepProps) {
  const isIpAddressValid =
    props.connectionConfig.ipAddress !== null &&
    isIP(props.connectionConfig.ipAddress);
  const isFormValid = isIpAddressValid;
  const handleIpAddressChange = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    props.setConnectionConfig({
      ...props.connectionConfig,
      ipAddress: event.target.value,
    });
  };
  useEffect(() => {
    props.setNextStepEnabled(isFormValid);
  });
  return (
    <Stack spacing={2}>
      <p>What is the local network IP address of your DUT?</p>
      <FormControl>
        <TextField
          id="ip-address"
          autoFocus
          aria-describedby="ip-address-helper-text"
          value={props.connectionConfig.ipAddress}
          placeholder="192.168.1.1"
          error={!isIpAddressValid}
          helperText={
            isIpAddressValid ? '' : 'Please enter a valid IPv4 or IPv6 address.'
          }
          onChange={handleIpAddressChange}
        />
      </FormControl>

      <Accordion>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          How do I find the IP address?
        </AccordionSummary>
        <AccordionDetails>
          <p>
            From the device's terminal, enter <code>ip addr | more</code> and
            find the IPv4 address for the connected network device (e.g. eth0).
          </p>
        </AccordionDetails>
      </Accordion>
    </Stack>
  );
}

function PortForwardingStep(props: AddOwnedDeviceStepProps) {
  const portNum = Number(props.connectionConfig.forwardedPort);
  const isPortValid: boolean = portNum > 0 && portNum < 65536;
  const isFormValid = isPortValid;
  useEffect(() => {
    props.setNextStepEnabled(isFormValid);
  });
  const handlePortChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    props.setConnectionConfig({
      ...props.connectionConfig,
      forwardedPort: Number(event.target.value),
    });
  };

  if (props.connectionConfig.networkType !== model.DutNetworkType.HOME) {
    return (
      <>
        <p>No port forwarding necessary!</p>
        <p>
          You can skip this step since port forwarding is only needed for
          devices on your home network.
        </p>
      </>
    );
  }

  const [tab, setTab] = useState('chrome');
  const handleTabChange = (event: React.SyntheticEvent, newValue: string) => {
    setTab(newValue);
  };
  return (
    <Stack spacing={2}>
      <FormControl>
        <FormHelperText id="port-helper-text">
          Since your device is remote, before we can connect to it from your
          workstation or cloudtop you will first need to forward a port to it.
          Choose a port number that is available on your workstation/cloudtop
          and see instructions for your corp laptop OS below:
        </FormHelperText>
        <InputLabel htmlFor="port" required shrink>
          Port Number
        </InputLabel>
        <TextField
          id="port"
          autoFocus
          aria-describedby="port-helper-text"
          defaultValue={props.connectionConfig.forwardedPort}
          onChange={handlePortChange}
          placeholder="192.168.1.1"
          error={!isPortValid}
          helperText={isPortValid ? '' : 'Please enter a valid IP port number.'}
        />
      </FormControl>

      <Box sx={{height: '10em'}}>
        <TabContext value={tab}>
          <Tabs
            value={tab}
            onChange={handleTabChange}
            aria-label="OS-specific instructions"
          >
            <Tab value="chrome" label="chromeOS" />
            <Tab value="mac" label="Mac OS" />
          </Tabs>
          <TabPanel value="chrome">Chrome ins</TabPanel>
          <TabPanel value="mac">
            <p>From your Mac's Terminal:</p>
            <ol>
              <li>
                Run <code>gcert</code> if you haven't yet today.
              </li>
              <li>
                Use <code>ssh</code> with the <code>-R</code> option to
                reverse-forward a port from your workstation or cloudtop to your
                corp laptop. Example:{' '}
                <code>
                  ssh {props.context?.username ?? '<username>'}
                  @&lt;workstation hostname&gt; -R{' '}
                  {props.connectionConfig.forwardedPort}
                  {props.connectionConfig.ipAddress}:22
                </code>
              </li>
            </ol>
          </TabPanel>
        </TabContext>
      </Box>
    </Stack>
  );
}

function HostNameStep(props: AddOwnedDeviceStepProps) {
  const isHostnameValid = isValidHostname(props.connectionConfig.hostname);
  useEffect(() => {
    props.setNextStepEnabled(isHostnameValid);
  });
  const handleHostnameChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    props.setConnectionConfig({
      ...props.connectionConfig,
      hostname: event.target.value,
    });
  };
  return (
    <Stack spacing={2}>
      <FormControl>
        <FormHelperText id="hostname-helper-text">
          Enter a new hostname for the device under test. This will be added to
          your ssh config.
          {/* and (optionally) /etc/hosts files. */}
        </FormHelperText>
        <InputLabel htmlFor="hostname" required shrink>
          Hostname
        </InputLabel>
        <TextField
          id="hostname"
          autoFocus
          defaultValue={props.connectionConfig.hostname}
          onChange={handleHostnameChange}
          aria-describedby="hostname-helper-text"
          placeholder="my-dut"
          error={!isHostnameValid}
          helperText={isHostnameValid ? '' : 'Please enter a valid hostname.'}
        />
      </FormControl>

      <FormControl>
        <FormControlLabel
          control={
            <Checkbox
              id="addToSshConfigCheckbox"
              checked={props.connectionConfig.addToSshConfig}
              onChange={(_e, v) => {
                props.setConnectionConfig({
                  ...props.connectionConfig,
                  addToSshConfig: v,
                });
              }}
              // Disabled because currently the device hostname must be in the
              // config. We leave the checkbox to show that it will be added.
              disabled
            />
          }
          label="Add to SSH config file"
        />
      </FormControl>

      {/* TODO(joelbecker): sudo /etc/hosts modifying not yet implemented */}
      {/* <FormControl>
        <Tooltip title="Not yet implemented">
          <FormControlLabel
            control={
              <Checkbox
                id="addToHostsFileCheckbox"
                checked={props.addToHostsFile}
                onChange={(_e, v) => {
                  props.setAddToHostsFile(v);
                }}
              />
            }
            label="Add to hosts file"
          />
        </Tooltip>
      </FormControl> */}
    </Stack>
  );
}

function ConnectionTestStep(props: AddOwnedDeviceStepProps) {
  const [error, setError] = useState('');

  // Connected device info
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    window.addEventListener('message', event => {
      const message = event.data;

      switch (message.command) {
        case 'deviceConnected':
          setInfo(message.info);
          break;
        case 'unableToConnect':
          setError(JSON.stringify(message.error));
          break;
      }
    });
    vscodeApi.postMessage({
      command: 'testDeviceConnection',
      config: props.connectionConfig,
    });
  }, []); // [] causes this to be run only once, after the first render

  // Once the connection succeeds, the ssh config change sticks and we shouldn't revisit steps.
  props.setBackEnabled(!info);

  return (
    <div tabIndex={-1} ref={elem => elem?.focus()}>
      {info ? (
        <Stack style={centerStyle}>
          <CheckIcon sx={{color: colors.green[500]}} />
          <h2>Success!</h2>
          {/* TODO(joelbecker): Show device info */}
        </Stack>
      ) : error ? (
        <Stack style={centerStyle}>
          <SentimentDissatisfiedIcon sx={{color: colors.red[500]}} />
          <h2>Unable to connect.</h2>
        </Stack>
      ) : (
        <Stack style={centerStyle}>
          <CircularProgress />
          <h2>Connecting to Device...</h2>
        </Stack>
      )}
    </div>
  );
}
