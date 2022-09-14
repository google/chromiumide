// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

async function onReady(): Promise<void> {
  const container = document.getElementById('main')!;
  const syslogUrl = container.dataset.syslogUrl!;
  const syslog = await getData(syslogUrl);
  const syslogs = syslog.split(/\n/);
  const arrayString: string[][] = [];
  for (let i = 0; i < syslogs.length; i++) {
    arrayString[i] = makeElement(syslogs[i]);
  }
  makeTable(arrayString, container);
  setInterval(() => {
    void (async () => {
      try {
        const syslog = await getData(syslogUrl);
        const syslogs = syslog.split(/\n/);
        const arrayString: string[][] = [];
        for (let i = 0; i < syslogs.length; i++) {
          arrayString[i] = makeElement(syslogs[i]);
        }
        displayTable(arrayString, container);
      } catch (err) {
        //If cannot get data, can pass through.
      }
    })();
  }, 1000);
}

function displayTable(arrayString: string[][], container: HTMLElement): void {
  const filterWord = (document.getElementById('filter')! as HTMLInputElement)
    .value;
  if (filterWord !== '') {
    arrayString = searchFilterWord(arrayString, filterWord);
  }
  container.removeChild(container.childNodes[0]);
  makeTable(arrayString, container);
}

function searchFilterWord(
  arrayString: string[][],
  filterWord: string
): string[][] {
  const filteredArrayString: string[][] = [];
  for (const line of arrayString) {
    for (const item of line) {
      const result = item.indexOf(filterWord);
      if (result !== -1) {
        filteredArrayString.push(line);
        break;
      }
    }
  }
  return filteredArrayString;
}

async function getData(url: string): Promise<string> {
  const response = await fetch(url);
  const data = await response.text();
  return data;
}

function makeElement(item: string): string[] {
  const separatorString = / /;
  const separateItem = item.split(separatorString);
  separateItem.push(separateItem.splice(3).join(' '));
  return separateItem;
}

function makeTable(data: string[][], container: HTMLElement): void {
  const table: HTMLTableElement = document.createElement('table');
  for (const line of data) {
    const row = table.insertRow();
    for (const value of line) {
      const cell = row.insertCell();
      cell.appendChild(document.createTextNode(value));
    }
    colorLogs(line, row);
  }
  container.appendChild(table);
}

function colorLogs(line: string[], row: HTMLTableRowElement): void {
  if (line[1] === 'NOTICE') {
    row.style.opacity = '0.8';
  } else if (line[1] === 'INFO' || line[1] === 'DEBUG') {
    row.style.opacity = '0.5';
  } else if (line[1] === 'ERR') {
    row.style.color = 'red';
    row.style.border = '1px solid red';
  } else if (line[1] === 'WARNING') {
    row.style.color = 'green';
    row.style.border = '1px solid green';
  } else if (line[1] === 'CRIT') {
    row.style.color = 'red';
    row.style.border = '1px solid red';
  } else if (line[1] === 'ALERT') {
    row.style.color = 'red';
    row.style.border = '1px solid red';
  } else if (line[1] === 'EMERG') {
    row.style.color = 'red';
    row.style.border = '1px solid red';
  }
}

void (async () => {
  try {
    await onReady();
  } catch (err) {
    alert(err);
  }
})();
