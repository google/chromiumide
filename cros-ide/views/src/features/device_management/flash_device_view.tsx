// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Checkbox,
  Container,
  FormControlLabel,
  FormGroup,
  FormLabel,
  Grid,
  LinearProgress,
  Radio,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import * as React from 'react';
import CheckIcon from '@mui/icons-material/Check';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import SentimentDissatisfiedIcon from '@mui/icons-material/SentimentDissatisfied';
import * as colors from '@mui/material/colors';
import * as model from '../../../../src/features/chromiumos/device_management/flash/flash_device_model';
import * as ReactPanelHelper from '../../react/common/react_panel_helper';
import * as buildModel from '../../../../src/features/chromiumos/device_management/builds/build_model';
import {BuildsBrowserState} from '../../../../src/features/chromiumos/device_management/builds/browser/builds_browser_model';
import {BuildsBrowser} from './builds_browser';

/** The first n FLASH_FLAGS that will be visible without expanding "More..." */
const NUM_POPULAR_FLAGS = 4;

const vscodeApi = acquireVsCodeApi();

ReactPanelHelper.receiveInitialData<model.FlashDeviceViewState>(vscodeApi).then(
  state => {
    ReactPanelHelper.createAndRenderRoot(<FlashDeviceView state={state} />);
  }
);

const containerStyle = {
  minHeight: '24em',
  maxWidth: '50em',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

export function FlashDeviceView(props: {state: model.FlashDeviceViewState}) {
  const [state, setState] = React.useState(props.state);

  const handleStateChange = (newState: model.FlashDeviceViewState) => {
    setState(newState);
  };

  React.useEffect(() => {
    window.addEventListener('message', event => {
      const message = event.data as model.UpdateBuildsBrowserState;
      switch (message.command) {
        case 'UpdateBuildsBrowserState':
          setState({
            ...state,
            buildsBrowserState: {
              ...message.state,
              builds: message.state.builds.map(buildModel.fixParsedBuildInfo),
            },
          });
          break;
      }
    });

    vscodeApi.postMessage({command: 'LoadBuilds'} as model.LoadBuilds);
  }, [state]);

  return <Container>{StepContents(state, handleStateChange)}</Container>;
}

function StepContents(
  state: model.FlashDeviceViewState,
  handleStateChange: (newState: model.FlashDeviceViewState) => void
) {
  const handleBuildsBrowserStateChange = (newState: BuildsBrowserState) => {
    handleStateChange({...state, buildsBrowserState: newState});
  };
  const handleBuildSelected = (buildInfo: buildModel.PrebuildInfo) => {
    handleStateChange({
      ...state,
      buildInfo: buildInfo,
      step: model.FlashDeviceStep.FLASH_CONFIRMATION,
    });
  };

  switch (state.step) {
    case model.FlashDeviceStep.HIGH_LEVEL_BUILD_SELECTION:
      return (
        <HighLevelBuildSelectionStep
          state={state}
          setState={handleStateChange}
        />
      );
    case model.FlashDeviceStep.BUILD_BROWSER:
      return (
        <BuildsBrowser
          state={state.buildsBrowserState}
          setState={handleBuildsBrowserStateChange}
          onBuildChosen={handleBuildSelected}
        />
      );
    case model.FlashDeviceStep.FLASH_CONFIRMATION:
      return (
        <FlashConfirmationStep state={state} setState={handleStateChange} />
      );
    case model.FlashDeviceStep.FLASH_PROGRESS:
      return <FlashProgress state={state} setState={handleStateChange} />;
  }
}

function HighLevelBuildSelectionStep(props: {
  state: model.FlashDeviceViewState;
  setState: (newState: model.FlashDeviceViewState) => void;
}) {
  const handleBuildSelectionType = (v: model.BuildSelectionType) => {
    props.setState({...props.state, buildSelectionType: v});
  };
  const handleBuildSelectionTypeRadio = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    handleBuildSelectionType(Number(event.target.value));
  };
  const handleBuildChannel = (v: buildModel.BuildChannel) => {
    props.setState({...props.state, buildChannel: v});
  };
  const handleNext = () => {
    if (
      props.state.buildSelectionType ===
      model.BuildSelectionType.LATEST_OF_CHANNEL
    ) {
      props.setState({
        ...props.state,
        step: model.FlashDeviceStep.FLASH_CONFIRMATION,
      });
    } else {
      props.setState({
        ...props.state,
        step: model.FlashDeviceStep.BUILD_BROWSER,
      });
    }
  };
  const handleCancel = () => {
    vscodeApi.postMessage({command: 'close'});
  };
  const handleKeydown = (e: React.KeyboardEvent) => {
    if (e.key === 'c') {
      handleBuildChannel('canary');
    } else if (e.key === 'd') {
      handleBuildChannel('dev');
    } else if (e.key === 'b') {
      handleBuildChannel('beta');
    } else if (e.key === 's') {
      handleBuildChannel('stable');
    } else if (e.key === 'l') {
      handleBuildSelectionType(model.BuildSelectionType.LATEST_OF_CHANNEL);
    } else if (e.key === 'f') {
      handleBuildSelectionType(model.BuildSelectionType.SPECIFIC_BUILD);
    } else if (e.key === 'Enter') {
      handleNext();
    } else if (e.key === 'Esc') {
      handleCancel();
    }
  };

  return (
    <div
      tabIndex={-1}
      onKeyDown={handleKeydown}
      ref={elem => elem?.focus()}
      style={containerStyle}
    >
      <Stack spacing={2}>
        <FormGroup>
          {/* We have to use a grid with radios in separate cell from their contents,
          since Mui does not support controls inside of the radio or its label, and
          we have a toggle group with Latest of <channel>. We therefore must also
          manually handle the radio group value and selection.*/}
          <Grid container spacing={2}>
            <Grid container item xs={12}>
              <Grid item xs="auto">
                <Radio
                  value={model.BuildSelectionType.LATEST_OF_CHANNEL}
                  checked={
                    props.state.buildSelectionType ===
                    model.BuildSelectionType.LATEST_OF_CHANNEL
                  }
                  onChange={handleBuildSelectionTypeRadio}
                />
              </Grid>
              <Grid item xs>
                <FormLabel>
                  <u>L</u>atest
                </FormLabel>

                <ToggleButtonGroup
                  exclusive
                  value={props.state.buildChannel}
                  onChange={(_e, v) => {
                    if (v !== null) {
                      handleBuildChannel(v);
                    }
                  }}
                >
                  <ToggleButton
                    value={'canary'}
                    title="The very latest build of all"
                  >
                    <u>C</u>anary
                  </ToggleButton>
                  <ToggleButton value={'dev'}>
                    <u>D</u>ev
                  </ToggleButton>
                  <ToggleButton value={'beta'}>
                    <u>B</u>eta
                  </ToggleButton>
                  <ToggleButton value={'stable'}>
                    <u>S</u>table
                  </ToggleButton>
                </ToggleButtonGroup>
              </Grid>
            </Grid>
            <Grid container item xs={12}>
              <Grid item xs="auto">
                <Radio
                  value={model.BuildSelectionType.SPECIFIC_BUILD}
                  checked={
                    props.state.buildSelectionType ===
                    model.BuildSelectionType.SPECIFIC_BUILD
                  }
                  onChange={handleBuildSelectionTypeRadio}
                />
              </Grid>
              <Grid item xs style={{verticalAlign: 'center'}}>
                <FormLabel>
                  <u>F</u>ind a specific build...
                </FormLabel>
              </Grid>
            </Grid>
          </Grid>
        </FormGroup>

        <Box sx={{display: 'flex', flexDirection: 'row', pt: 2}}>
          <Button variant="outlined" onClick={handleCancel} sx={{mr: 1}}>
            Cancel
          </Button>
          <Box sx={{flex: '1 1 auto'}} />
          <Button variant="contained" onClick={handleNext}>
            Next
          </Button>
        </Box>
      </Stack>
    </div>
  );
}

function FlashConfirmationStep(props: {
  state: model.FlashDeviceViewState;
  setState: (newState: model.FlashDeviceViewState) => void;
}) {
  const handleFlash = () => {
    vscodeApi.postMessage({command: 'flash', state: props.state});
    props.setState({
      ...props.state,
      step: model.FlashDeviceStep.FLASH_PROGRESS,
    });
  };
  const handleBack = () => {
    if (
      props.state.buildSelectionType ===
      model.BuildSelectionType.LATEST_OF_CHANNEL
    ) {
      props.setState({
        ...props.state,
        step: model.FlashDeviceStep.HIGH_LEVEL_BUILD_SELECTION,
      });
    } else {
      props.setState({
        ...props.state,
        step: model.FlashDeviceStep.BUILD_BROWSER,
      });
    }
  };

  const handleKeydown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleFlash();
    } else if (e.key === 'Esc') {
      handleBack();
    }
  };

  return (
    <div
      tabIndex={-1}
      onKeyDown={handleKeydown}
      ref={elem => elem?.focus()}
      style={containerStyle}
    >
      <Stack spacing={2}>
        <Typography>
          <p>
            Continuing will flash{' '}
            <b>
              "{props.state.hostname}" ({props.state.board})
            </b>{' '}
            with build:
          </p>
        </Typography>

        <BuildVersionInfo state={props.state} setState={props.setState} />

        <FlashFlags state={props.state} setState={props.setState} />

        <Box sx={{display: 'flex', flexDirection: 'row', pt: 2}}>
          <Button onClick={handleBack} sx={{mr: 1}}>
            Back
          </Button>
          <Box sx={{flex: '1 1 auto'}} />
          <Button variant="contained" color="error" onClick={handleFlash}>
            Flash Now
          </Button>
        </Box>
      </Stack>
    </div>
  );
}

function FlashFlags(props: {
  state: model.FlashDeviceViewState;
  setState: (newState: model.FlashDeviceViewState) => void;
}) {
  const handleFlagChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newFlags = event.target.checked
      ? [...props.state.flashCliFlags, event.target.value]
      : props.state.flashCliFlags.filter(f => f !== event.target.value);
    props.setState({
      ...props.state,
      flashCliFlags: newFlags,
    });
  };
  return (
    <FormGroup>
      {model.FLASH_FLAGS.slice(0, NUM_POPULAR_FLAGS).map(f =>
        flashFlagCheckbox(f)
      )}
      <Accordion>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography>More Flags</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <FormGroup>
            {model.FLASH_FLAGS.slice(NUM_POPULAR_FLAGS).map(f =>
              flashFlagCheckbox(f)
            )}
          </FormGroup>
        </AccordionDetails>
      </Accordion>
    </FormGroup>
  );

  function flashFlagCheckbox(f: model.FlashFlag): JSX.Element {
    return (
      <Tooltip title={`(${f.cliFlag}) ${f.help}`}>
        <FormControlLabel
          control={
            <Checkbox
              onChange={handleFlagChange}
              value={f.cliFlag}
              checked={
                props.state.flashCliFlags.find(f2 => f2 === f.cliFlag) !==
                undefined
              }
            />
          }
          label={f.label}
        />
      </Tooltip>
    );
  }
}

function BuildVersionInfo(props: {
  state: model.FlashDeviceViewState;
  setState: (newState: model.FlashDeviceViewState) => void;
}) {
  const labelColWidth = 3;
  const valueColWidth = 12 - labelColWidth;

  if (
    props.state.buildSelectionType ===
    model.BuildSelectionType.LATEST_OF_CHANNEL
  ) {
    return (
      <Grid container spacing={1}>
        <Grid
          item
          xs={labelColWidth}
          style={{display: 'flex', justifyContent: 'flex-end'}}
        >
          <Typography>
            <b>Channel:</b>
          </Typography>
        </Grid>
        <Grid item xs={valueColWidth}>
          <Typography>{props.state.buildChannel}</Typography>
        </Grid>{' '}
        <Grid
          item
          xs={labelColWidth}
          style={{display: 'flex', justifyContent: 'flex-end'}}
        >
          <Typography>
            <b>Version:</b>
          </Typography>
        </Grid>
        <Grid item xs={valueColWidth}>
          <Typography>(Latest)</Typography>
        </Grid>
      </Grid>
    );
  } else {
    return (
      <Grid container spacing={1}>
        <Grid
          item
          xs={labelColWidth}
          style={{display: 'flex', justifyContent: 'flex-end'}}
        >
          <Typography>
            <b>Channel:</b>
          </Typography>
        </Grid>
        <Grid item xs={valueColWidth}>
          <Typography>
            {props.state.buildInfo?.buildChannel?.toString()}
          </Typography>
        </Grid>{' '}
        <Grid
          item
          xs={labelColWidth}
          style={{display: 'flex', justifyContent: 'flex-end'}}
        >
          <Typography>
            <b>Chrome OS:</b>
          </Typography>
        </Grid>
        <Grid item xs={valueColWidth}>
          <Typography>{props.state.buildInfo?.chromeOsVersion}</Typography>
        </Grid>
        <Grid
          item
          xs={labelColWidth}
          style={{display: 'flex', justifyContent: 'flex-end'}}
        >
          <Typography>
            <b>Chrome:</b>
          </Typography>
        </Grid>
        <Grid item xs={valueColWidth}>
          <Typography>{props.state.buildInfo?.chromeVersion}</Typography>
        </Grid>
        <Grid
          item
          xs={labelColWidth}
          style={{display: 'flex', justifyContent: 'flex-end'}}
        >
          <b>
            <Typography>
              <b>ARC:</b>
            </Typography>
          </b>
        </Grid>
        <Grid item xs={valueColWidth}>
          <Typography>{props.state.buildInfo?.arcVersion}</Typography>
        </Grid>
      </Grid>
    );
  }
}

function FlashProgress(props: {
  state: model.FlashDeviceViewState;
  setState: (newState: model.FlashDeviceViewState) => void;
}) {
  React.useEffect(() => {
    window.addEventListener('message', event => {
      const message = event.data as model.FlashDevicePanelMessage;
      switch (message.command) {
        case 'flashProgressUpdate':
          props.setState({
            ...props.state,
            flashProgress: message.progress,
          });
          break;
        case 'flashComplete':
          props.setState({...props.state, flashingComplete: true});
          break;
        case 'flashError':
          props.setState({...props.state, flashError: message.errorMessage});
      }
    });
  }, [props]); // [] causes this to be run only once, after the first render
  const handleCancel = () => {
    vscodeApi.postMessage({
      command: 'cancelFlash',
    } as model.FlashDeviceViewMessage);

    // Go back to flash confirmation
    props.setState({
      ...props.state,
      step: model.FlashDeviceStep.FLASH_CONFIRMATION,
    });
  };

  if (props.state.flashError) {
    return (
      <Stack style={containerStyle}>
        <h2>Error while Flashing</h2>
        <SentimentDissatisfiedIcon sx={{color: colors.red[500]}} />
        <Typography>See device management output.</Typography>
      </Stack>
    );
  } else if (!props.state.flashingComplete) {
    return (
      <div style={containerStyle}>
        <Stack spacing={2}>
          <h2>Flashing...</h2>
          <LinearProgress
            variant={
              props.state.flashProgress > 0.0 ? 'determinate' : 'indeterminate'
            }
            value={props.state.flashProgress}
            sx={{maxWidth: '70em', minWidth: '32em'}}
          />
          <Button onClick={handleCancel}>Cancel</Button>
        </Stack>
      </div>
    );
  } else {
    return (
      <Stack style={containerStyle}>
        <h2>Success!</h2>
        <CheckIcon sx={{color: colors.green[500]}} />
      </Stack>
    );
  }
}
