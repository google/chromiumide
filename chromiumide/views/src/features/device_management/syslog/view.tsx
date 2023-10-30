// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {ArrowDownward, ContentCopy} from '@mui/icons-material';
import {
  Checkbox,
  Fab,
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
  Zoom,
} from '@mui/material';
import {createTheme, SxProps, ThemeProvider} from '@mui/material/styles';
import {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  ChangeEventHandler,
  CSSProperties,
  MutableRefObject,
} from 'react';
import {
  TableVirtuoso,
  TableVirtuosoHandle,
  TableVirtuosoProps,
} from 'react-virtuoso';
import {
  SyslogViewContext,
  SyslogEntry,
  SyslogSeverity,
  SyslogViewBackendMessage,
  SyslogViewFrontendMessage,
  stringifySyslogEntries,
} from '../../../../../src/features/device_management/syslog/model';
import * as ReactPanelHelper from '../../../react/common/react_panel_helper';
import * as viewModel from './viewmodel';
import {
  initialTextFilter,
  matchSyslogEntry,
  SyslogFilter,
  TextFilter,
} from './viewmodel';

// VS Code CSS variable constants.
const TEXT_COLOR = 'var(--vscode-editor-foreground)';
const BACKGROUND_COLOR = 'var(--vscode-editor-background)';
const INFO_COLOR = 'var(--vscode-editorInfo-foreground)';
const WARNING_COLOR = 'var(--vscode-editorWarning-foreground)';
const ERROR_COLOR = 'var(--vscode-editorError-foreground)';
const MATCH_HIGHLIGHT_COLOR =
  'var(--vscode-editor-findMatchHighlightBackground)';

// Acquire the VS Code webview instance.
const vscodeApi = acquireVsCodeApi();

// Create the panel.
ReactPanelHelper.receiveInitialData<SyslogViewContext>(vscodeApi).then(ctx => {
  ReactPanelHelper.createAndRenderRoot(<SyslogView ctx={ctx} />);
});

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
  const [processFilter, setProcessFilter] = useState<TextFilter>(
    initialTextFilter()
  );
  const [messageFilter, setMessageFilter] = useState<TextFilter>(
    initialTextFilter()
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
            textFilter={processFilter}
            setTextFilter={setProcessFilter}
          />
          <TextFilterInput
            title="Message"
            textFilter={messageFilter}
            setTextFilter={setMessageFilter}
          />
        </Stack>
        <SyslogTable
          filter={{
            onProcess: processFilter,
            onMessage: messageFilter,
          }}
        />
      </div>
    </ThemeProvider>
  );
}

/** The input for a text filter. */
function TextFilterInput(props: {
  title: string;
  textFilter: TextFilter;
  setTextFilter: (update: (prev: TextFilter) => TextFilter) => void;
}) {
  const {title, textFilter, setTextFilter} = props;
  const [inputError, setInputError] = useState<string>();
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
        setTextFilter(textFilter => ({
          ...textFilter,
          includes,
          regex: calcRegex(includes, textFilter.byRegex),
        })),
      [setTextFilter, calcRegex]
    );
  const handleMessageByRegex: ChangeEventHandler<HTMLInputElement> =
    useCallback(
      ({target: {checked: byRegex}}) => {
        setTextFilter(textFilter => ({
          ...textFilter,
          byRegex,
          regex: calcRegex(textFilter.includes, byRegex),
        }));
      },
      [setTextFilter, calcRegex]
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

/** Maximum line number of one copy. */
const COPY_MAX = 10000;
const COPY_MAX_TEXT = '10k';

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
      if (msg.command === 'add') {
        setEntries(entries => {
          const newEntries = [...entries];
          for (const newEntry of msg.newEntries) {
            // We write to the index directly (instead of `.push`).
            // This update is robust with concurrency,
            // because it is reorderable and idempotent.
            newEntries[newEntry.lineNum] = newEntry;
          }
          return newEntries;
        });
      }
    },
    [setEntries]
  );
  useEffect(() => {
    window.addEventListener('message', handleMsg);
    return () => window.removeEventListener('message', handleMsg);
  }, [handleMsg]);
  // Calculate and cache filtered entries
  const filteredEntries = useMemo(
    () => entries.flatMap(entry => matchSyslogEntry(entry, filter) ?? []),
    [entries, filter]
  );
  // For 'Copy to clipboard' button.
  const handleClipboardCopier = useCallback(
    () =>
      postMessage({
        command: 'copy',
        // Copies up to COPY_MAX lines from the end.
        text: stringifySyslogEntries(
          filteredEntries.map(viewModel.toSyslogEntry).slice(-COPY_MAX)
        ),
      }),
    [filteredEntries]
  );
  return (
    <>
      <SyslogTableBody entries={filteredEntries} />
      <CustomTooltip
        title={
          <div style={{textAlign: 'center'}}>
            Copy to clipboard
            <br />
            (up to {COPY_MAX_TEXT} lines)
          </div>
        }
      >
        <Fab
          onClick={handleClipboardCopier}
          color="default"
          size="small"
          sx={{
            position: 'absolute',
            top: 40,
            right: 30,
            boxShadow: 0,
          }}
        >
          <ContentCopy />
        </Fab>
      </CustomTooltip>
    </>
  );
}

/**
 * The body of the syslog table,
 * wrapping `TableVirtuoso` and the 'Jump to bottom' button.
 */
function SyslogTableBody(props: {entries: viewModel.MatchedSyslogEntry[]}) {
  const {entries} = props;
  const virtuosoRef = useRef<TableVirtuosoHandle>(null);
  // Memoizes props passed to `TableVirtuoso` for performance
  const virtuosoProps: TableVirtuosoProps<
    viewModel.MatchedSyslogEntry,
    unknown
  > = useMemo(
    () => ({
      style: {marginTop: 10},
      followOutput: 'smooth',
      components: {
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
                <col width="45" />
                <col width="220" />
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
      },
      fixedHeaderContent: () => (
        <TableRow sx={{backgroundColor: BACKGROUND_COLOR}}>
          {['#', 'Timestamp', 'Severity', 'Process', 'Message'].map(
            (label, i) => (
              <TableCell>
                <div style={tableCellStyle(i)}>{label}</div>
              </TableCell>
            )
          )}
        </TableRow>
      ),
      itemContent: (i, entry) => <SyslogRow entry={entry} />,
      computeItemKey: (i, entry) => entry.lineNum,
    }),
    []
  );
  // Handle the 'at bottom recently' state, i.e., whether
  // the scroller was 'at bottom' any time in the last 1 second.
  const [atBottomRecently, setAtBottomRecently] = useState(false);
  const atBottomClearer = useRef<NodeJS.Timeout | null>(null);
  const handleAtBottom = useCallback(
    (atBottom: boolean) => {
      if (atBottom) {
        clearTimeoutRef(atBottomClearer); // Cancel the clearer.
        setAtBottomRecently(true);
      } else {
        // Delay setting `atBottom` to `false` by 1 second, because
        // `exactAtBottom` can be temporarily `false` due to auto-scrolling.
        setTimeoutRef(atBottomClearer, () => setAtBottomRecently(false), 1000);
      }
    },
    [atBottomClearer, setAtBottomRecently]
  );
  // Handle the 'scrolling recently' state, i.e., whether
  // the scroller was 'scrolling' any time in the last 3 seconds.
  const [scrollingRecently, setScrollingRecently] = useState(true);
  const scrollingClearer = useRef<NodeJS.Timeout | null>(null);
  const handleScrolling = useCallback(
    (scrolling: boolean) => {
      if (scrolling) {
        clearTimeoutRef(scrollingClearer); // Cancel the clearer.
        setScrollingRecently(true);
      } else {
        // Delay setting `scrolling` to `false` by 3 seconds.
        setTimeoutRef(
          scrollingClearer,
          () => setScrollingRecently(false),
          3000
        );
      }
    },
    [scrollingClearer, setScrollingRecently]
  );
  // For the 'Jump to bottom' button.
  const handleBottomJumper = useCallback(() => {
    virtuosoRef.current?.scrollToIndex({
      index: entries.length - 1,
      behavior: 'auto',
    });
  }, [virtuosoRef, entries]);
  const bottomJumperShown =
    // The 'Jump to bottom' button is shown if
    // scrolling recently and not at bottom recently.
    !atBottomRecently && scrollingRecently;
  return (
    <>
      <TableVirtuoso
        ref={virtuosoRef}
        data={entries}
        atBottomStateChange={handleAtBottom}
        isScrolling={handleScrolling}
        {...virtuosoProps}
      />
      <CustomTooltip title={bottomJumperShown && 'Jump to bottom'}>
        <div
          style={{
            position: 'fixed',
            bottom: 30,
            // Center the button horizontally
            left: '50%',
            transform: 'translateX(-50%)',
          }}
        >
          <Zoom in={bottomJumperShown}>
            <Fab
              onClick={handleBottomJumper}
              color="primary"
              size="small"
              sx={{
                opacity: 0.5,
                '&:hover': {opacity: 1},
              }}
            >
              <ArrowDownward />
            </Fab>
          </Zoom>
        </div>
      </CustomTooltip>
    </>
  );
}

function MatchedText(props: {entry: viewModel.MatchedText}): JSX.Element {
  const {
    entry: {
      text,
      range: [start, end],
    },
  } = props;

  if (start === end) {
    return <>{text}</>;
  }
  const head = text.substring(0, start);
  const highlight = text.substring(start, end);
  const tail = text.substring(end);
  return (
    <>
      {head}
      <mark style={{background: MATCH_HIGHLIGHT_COLOR}}>{highlight}</mark>
      {tail}
    </>
  );
}

/** The row for each syslog entry. */
function SyslogRow(props: {entry: viewModel.MatchedSyslogEntry}): JSX.Element {
  const {
    entry: {lineNum, timestamp, severity, process, message},
  } = props;

  const processElement = process && <MatchedText entry={process} />;
  const messageElement = <MatchedText entry={message} />;
  const sx = sxSyslogEntry(severity);
  // The line number is 1-based.
  return (
    <>
      {[lineNum + 1, timestamp, severity, processElement, messageElement].map(
        (s, i) => (
          <TableCell sx={sx}>
            <div style={tableCellStyle(i)}>{s}</div>
          </TableCell>
        )
      )}
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

/** Gets the style for the div of a table cell of the i-th column. */
function tableCellStyle(i: number): CSSProperties {
  return {
    textAlign: i === 0 ? 'right' : 'left',
    paddingLeft: i === 0 ? 0 : i === 1 ? 15 : 5,
  };
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

/** Wraps `setTimeout` for a mutable ref of timeout. */
function setTimeoutRef(
  timeoutRef: MutableRefObject<NodeJS.Timeout | null>,
  callback: () => void,
  ms: number
) {
  if (timeoutRef.current) return;
  timeoutRef.current = setTimeout(callback, ms);
}

/** Wraps `clearTimeout` for a mutable ref of timeout. */
function clearTimeoutRef(timeoutRef: MutableRefObject<NodeJS.Timeout | null>) {
  if (!timeoutRef.current) return;
  clearTimeout(timeoutRef.current);
  timeoutRef.current = null;
}
