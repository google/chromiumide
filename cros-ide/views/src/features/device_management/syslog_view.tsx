// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {
  Checkbox,
  FormLabel,
  Input,
  InputAdornment,
  Stack,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Tooltip,
  TooltipProps,
} from '@mui/material';
import {createTheme, SxProps, ThemeProvider} from '@mui/material/styles';
import {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useState,
  ChangeEventHandler,
} from 'react';
import {TableVirtuoso} from 'react-virtuoso';
import * as ReactPanelHelper from '../../react/common/react_panel_helper';
import {
  SyslogViewContext,
  SyslogEntry,
  SyslogSeverity,
  SyslogViewBackendMessage,
  SyslogViewFrontendMessage,
} from '../../../../src/features/chromiumos/device_management/syslog/model';

// VS Code CSS variable constants.
const TEXT_COLOR = 'var(--vscode-editor-foreground)';
const BACKGROUND_COLOR = 'var(--vscode-editor-background)';
const INFO_COLOR = 'var(--vscode-editorInfo-foreground)';
const WARNING_COLOR = 'var(--vscode-editorWarning-foreground)';
const ERROR_COLOR = 'var(--vscode-editorError-foreground)';

// Acquire the VS Code webview instance.
const vscodeApi = acquireVsCodeApi<SyslogViewPersistentState>();

// Create the panel.
ReactPanelHelper.receiveInitialData<SyslogViewContext>(vscodeApi).then(ctx => {
  ReactPanelHelper.createAndRenderRoot(<SyslogView ctx={ctx} />);
});

/**
 * Persistent state of the syslog view.
 *
 * It doesn't include the log contents, as they can be huge.
 */
type SyslogViewPersistentState = {
  filter: SyslogFilter;
};

/**
 * Filter on a syslog entry.
 * It means the conjunction of the conditions.
 *
 * TODO(ymat): Also support the disjunction.
 */
type SyslogFilter = {
  onProcess: TextFilter;
  onMessage: TextFilter;
};

/** Filter on a text, possibly using a regex. */
type TextFilter = {
  /** The thing expected to be included in the message. */
  includes: string;
  /** Whether the string `includes` is a regex or a plain string. */
  byRegex: boolean;
  /**
   * The cached regex object.
   * Is set only if `byRegex` is true and `includes` is a valid regular expression.
   */
  regex?: RegExp;
};

/**
 * Gets the persistent state, initializing it for the startup.
 * Wrapper of `vscodeApi.getState`.
 */
function getPersistentState(): SyslogViewPersistentState {
  return (
    vscodeApi.getState() ?? {
      filter: {onProcess: initialTextFilter(), onMessage: initialTextFilter()},
    }
  );
}

function initialTextFilter(): TextFilter {
  return {includes: '', byRegex: false, regex: undefined};
}

/**
 * Updates the persistent state, overwriting some fields.
 * Wrapper of `vscodeApi.setState`.
 */
function setPersistentState(state: Partial<SyslogViewPersistentState>): void {
  vscodeApi.setState({...getPersistentState(), ...state});
}

/**
 * Posts a message to the backend.
 * Type-safe wrapper of `vscodeApi.postMessage`.
 */
function postMessage(msg: SyslogViewFrontendMessage): void {
  vscodeApi.postMessage(msg);
}

/** Main component of the syslog view. */
function SyslogView(props: {ctx: SyslogViewContext}): JSX.Element {
  const {
    ctx: {remoteSyslogPath},
  } = props;

  // Create MUI theme.
  const muiTheme = useMemo(
    () =>
      createTheme({
        palette: {
          text: {primary: TEXT_COLOR},
          background: {default: BACKGROUND_COLOR},
        },
      }),
    []
  );

  // Manage the filter.
  const [filter, setFilterBase] = useState<SyslogFilter>(
    getPersistentState().filter
  );
  const setFilter = useCallback(
    (filter: SyslogFilter): void => {
      setFilterBase(filter);
      setPersistentState({filter});
    },
    [setFilterBase]
  );
  const setProcessFilter = useCallback(
    (processFilter: TextFilter): void =>
      setFilter({...filter, onProcess: processFilter}),
    [filter, setFilter]
  );
  const setMessageFilter = useCallback(
    (messageFilter: TextFilter): void =>
      setFilter({...filter, onMessage: messageFilter}),
    [filter, setFilter]
  );

  return (
    <ThemeProvider theme={muiTheme}>
      <div
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: 0,
          right: 0,
          padding: 10,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <h1 style={{fontSize: 18}}>{remoteSyslogPath}</h1>
        <Stack direction="row" spacing={7}>
          <TextFilterInput
            title="Process"
            textFilter={filter.onProcess}
            setTextFilter={setProcessFilter}
          />
          <TextFilterInput
            title="Message"
            textFilter={filter.onMessage}
            setTextFilter={setMessageFilter}
          />
        </Stack>
        <SyslogTable filter={filter} />
      </div>
    </ThemeProvider>
  );
}

/** The input for a text filter. */
function TextFilterInput(props: {
  title: string;
  textFilter: TextFilter;
  setTextFilter: (textFilter: TextFilter) => void;
}) {
  const {title, textFilter, setTextFilter} = props;
  const [inputError, setInputError] = useState<string>();
  const updateTextFilter = useCallback(
    (newTextFilter: Partial<TextFilter>): void =>
      setTextFilter({...textFilter, ...newTextFilter}),
    [textFilter, setTextFilter]
  );
  // Calculate regex, setting `inputError` on syntax error.
  const calcRegex = useCallback(
    (includes: string, byRegex: boolean): RegExp | undefined => {
      if (!byRegex) {
        setInputError(undefined);
        return;
      }
      try {
        const regex = new RegExp(includes);
        setInputError(undefined);
        return regex;
      } catch (err) {
        if (err instanceof SyntaxError) {
          setInputError(err.message);
        }
      }
    },
    [setInputError]
  );
  // Handle changes
  const handleMessageIncludes: ChangeEventHandler<HTMLInputElement> =
    useCallback(
      ({target: {value: includes}}) =>
        updateTextFilter({
          includes,
          regex: calcRegex(includes, textFilter.byRegex),
        }),
      [updateTextFilter, calcRegex, textFilter]
    );
  const handleMessageByRegex: ChangeEventHandler<HTMLInputElement> =
    useCallback(
      ({target: {checked: byRegex}}) => {
        updateTextFilter({
          byRegex,
          regex: calcRegex(textFilter.includes, byRegex),
        });
      },
      [updateTextFilter, calcRegex, textFilter]
    );

  return (
    <div>
      <FormLabel>
        <div style={{display: 'inline-block', marginRight: 10}}>{title}:</div>
      </FormLabel>
      <CustomTooltip title={inputError}>
        <Input
          placeholder={`Filter ${textFilter.regex ? 'regex' : 'text'}`}
          value={textFilter.includes}
          onChange={handleMessageIncludes}
          error={!!inputError}
          endAdornment={
            <InputAdornment position="end">
              <CustomTooltip title="Use regular expression">
                <Checkbox
                  checked={textFilter.byRegex}
                  onChange={handleMessageByRegex}
                  icon={<RegexIcon />}
                  checkedIcon={<RegexIcon />}
                />
              </CustomTooltip>
            </InputAdornment>
          }
        />
      </CustomTooltip>
    </div>
  );
}

/** The icon for the regex option. */
function RegexIcon(): JSX.Element {
  return <i className="codicon codicon-regex" />;
}

/** The table for the syslog. */
function SyslogTable(props: {filter: SyslogFilter}): JSX.Element {
  const {filter} = props;
  const [entries, setEntries] = useState<SyslogEntry[]>([]);
  // Send an update request every 1 second.
  useEffect(() => {
    const repeater = setInterval(() => {
      postMessage({command: 'reload'});
    }, 1000);
    return () => clearInterval(repeater);
  }, []);
  // Handle a message from the backend.
  const handleMsg = useCallback(
    ({data: msg}: MessageEvent<SyslogViewBackendMessage>) => {
      if (msg.command === 'reset') {
        setEntries(msg.entries);
      }
    },
    []
  );
  useEffect(() => {
    window.addEventListener('message', handleMsg);
    return () => window.removeEventListener('message', handleMsg);
  }, [handleMsg]);
  return (
    <TableVirtuoso
      style={{marginTop: 10}}
      data={entries.filter(entry => matchesFilter(entry, filter))}
      components={{
        Table: props => {
          const {children, ...propsRest} = props;
          return (
            <Table
              padding="none"
              sx={{
                tableLayout: 'fixed',
                overflow: 'auto',
                overflowWrap: 'break-word',
              }}
              {...propsRest}
            >
              <colgroup>
                <col width="210" />
                <col width="70" />
                <col width="140" />
                <col />
              </colgroup>
              {children}
            </Table>
          );
        },
        TableHead,
        TableRow,
        TableBody: forwardRef((props, ref) => (
          <TableBody {...props} ref={ref} />
        )),
      }}
      fixedHeaderContent={() => (
        <TableRow sx={{backgroundColor: BACKGROUND_COLOR}}>
          {['Timestamp', 'Severity', 'Process', 'Message'].map(label => (
            <TableCell>{label}</TableCell>
          ))}
        </TableRow>
      )}
      itemContent={(i, entry) => <SyslogRow entry={entry} />}
      computeItemKey={(i, entry) => entry.lineNum}
    />
  );
}

/** Checks if the syslog entry matches the filter. */
function matchesFilter(entry: SyslogEntry, filter: SyslogFilter): boolean {
  const {process, message} = entry;
  const {onProcess, onMessage} = filter;
  return (
    matchesTextFilter(process ?? '', onProcess) &&
    matchesTextFilter(message, onMessage)
  );
}

/** Checks if a text matches the text filter. */
function matchesTextFilter(text: string, textFilter: TextFilter): boolean {
  const {includes, byRegex, regex} = textFilter;
  return !byRegex ? text.includes(includes) : !regex || regex.test(text);
}

/** The row for each syslog entry. */
function SyslogRow(props: {entry: SyslogEntry}): JSX.Element {
  const {
    entry: {timestamp, severity, process, message},
  } = props;
  const sx = sxSyslogEntry(severity);
  return (
    <>
      {[timestamp, severity, process, message].map((s, i) => (
        <TableCell sx={sx}>
          <div style={{paddingRight: i === 3 ? 0 : 5}}>{s}</div>
        </TableCell>
      ))}
    </>
  );
}

/** Calculate the color for the syslog table row, based on the severity. */
function sxSyslogEntry(severity?: SyslogSeverity): SxProps {
  switch (severity) {
    case 'DEBUG':
    case 'INFO':
      return {opacity: 0.8};
    case 'NOTICE':
      return {color: INFO_COLOR};
    case 'WARNING':
      return {color: WARNING_COLOR};
    case 'ERR':
    case 'ALERT':
    case 'EMERG':
    case 'CRIT':
      return {color: ERROR_COLOR};
    default:
      return {};
  }
}

/** Custom tooltip, with the distance between the top reduced. */
function CustomTooltip(props: TooltipProps) {
  return (
    <Tooltip
      {...props}
      PopperProps={{
        modifiers: [
          {
            name: 'offset',
            options: {
              offset: [0, -10],
            },
          },
        ],
      }}
    />
  );
}
