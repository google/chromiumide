// Copyright 2022 The ChromiumOS Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

async function onReady(): Promise<void> {
  const container = document.getElementById('main')!;
  const syslogUrl = container.dataset.syslogUrl!;
  const syslog = await getData(syslogUrl);
  container.textContent = syslog;
}

async function getData(url: string): Promise<string> {
  const response = await fetch(url);
  const data = await response.text();
  return data;
}

void (async () => {
  try {
    await onReady();
  } catch (err) {
    alert(err);
  }
})();
