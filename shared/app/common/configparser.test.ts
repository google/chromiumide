// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {ConfigParser} from './configparser';

type Config = Record<string, Record<string, string>>;

describe('configparser', () => {
  for (const testCase of [
    {
      name: 'parses simple input',
      // From https://docs.python.org/3/library/configparser.html#quick-start
      content: `[DEFAULT]
ServerAliveInterval = 45
Compression = yes
CompressionLevel = 9
ForwardX11 = yes

[forge.example]
User = hg

[topsecret.server.example]
Port = 50022
ForwardX11 = no
`,
      wantResult: {
        DEFAULT: {
          ServerAliveInterval: '45',
          Compression: 'yes',
          CompressionLevel: '9',
          ForwardX11: 'yes',
        },
        'forge.example': {
          User: 'hg',
        },
        'topsecret.server.example': {
          Port: '50022',
          ForwardX11: 'no',
        },
      } as Config,
    },
    {
      name: 'parses more complex input',
      // From https://docs.python.org/3/library/configparser.html#supported-ini-file-structure
      content: `[Simple Values]
key=value
spaces in keys=allowed
spaces in values=allowed as well
spaces around the delimiter = obviously
you can also use : to delimit keys from values

[All Values Are Strings]
values like this: 1000000
or this: 3.14159265359
are they treated as numbers? : no
integers, floats and booleans are held as: strings
can use the API to get converted values directly: true

[Multiline Values]
chorus: I'm a lumberjack, and I'm okay
    I sleep all night and I work all day
[No Values]
key_without_value
empty string value here =

[You can use comments]
# like this
; or this

# By default only in an empty line.
# Inline comments can be harmful because they prevent users
# from using the delimiting characters as parts of values.
# That being said, this can be customized.

    [Sections Can Be Indented]
        can_values_be_as_well = True
        does_that_mean_anything_special = False
        purpose = formatting for readability
        multiline_values = are
            handled just fine as
            long as they are indented
            deeper than the first line
            of a value
        # Did I mention we can indent comments, too?
`,
      wantResult: {
        'Simple Values': {
          key: 'value',
          'spaces in keys': 'allowed',
          'spaces in values': 'allowed as well',
          'spaces around the delimiter': 'obviously',
          'you can also use': 'to delimit keys from values',
        },
        'All Values Are Strings': {
          'values like this': '1000000',
          'or this': '3.14159265359',
          'are they treated as numbers?': 'no',
          'integers, floats and booleans are held as': 'strings',
          'can use the API to get converted values directly': 'true',
        },
        'Multiline Values': {
          chorus: `I'm a lumberjack, and I'm okay
I sleep all night and I work all day`,
        },
        'No Values': {
          key_without_value: '',
          'empty string value here': '',
        },
        'You can use comments': {},
        'Sections Can Be Indented': {
          can_values_be_as_well: 'True',
          does_that_mean_anything_special: 'False',
          purpose: 'formatting for readability',
          multiline_values: `are
handled just fine as
long as they are indented
deeper than the first line
of a value`,
        },
      },
    },
  ]) {
    it(testCase.name, () => {
      const parser = new ConfigParser(testCase.content);
      expect(parser.parse()).toEqual(testCase.wantResult);
    });
  }
});
