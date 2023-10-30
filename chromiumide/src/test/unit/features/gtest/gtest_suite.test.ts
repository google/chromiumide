// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {GtestSuite} from '../../../../features/gtest/gtest_suite';
import * as parser from '../../../../features/gtest/parser';
import {cleanState} from '../../../testing';

describe('GtestSuite', () => {
  const state = cleanState(() => {
    const controller = vscode.tests.createTestController('id', 'label');
    const testFileItem = controller.createTestItem('file', 'file');

    return {controller, testFileItem};
  });

  function createSuite(isTyped: boolean, cases: parser.TestCaseMap) {
    return new GtestSuite(
      state.controller,
      state.testFileItem,
      vscode.Uri.file('/test.cc'),
      new vscode.Range(0, 0, 0, 0),
      'suite',
      isTyped,
      cases
    );
  }

  it('calculates test filter of non-typed, non-parameterized test suite', () => {
    const suite = createSuite(
      /*isTyped=*/ false,
      new Map([
        [
          'NonParameterizedCase',
          {isParameterized: false, range: new vscode.Range(0, 0, 0, 0)},
        ],
      ])
    );
    expect(suite.getGtestFilter()).toBe('suite.*');
  });

  it('calculates test filter of non-typed, parameterized test suite', () => {
    const suite = createSuite(
      /*isTyped=*/ false,
      new Map([
        [
          'ParameterizedCase',
          {isParameterized: true, range: new vscode.Range(0, 0, 0, 0)},
        ],
      ])
    );
    expect(suite.getGtestFilter().split(':')).toEqual(
      jasmine.arrayWithExactContents([
        // with instantiation name
        '*/suite.*/*',
        // without instantiation name
        'suite.*/*',
      ])
    );
  });

  it('calculates test filter of non-typed, mixed test suite', () => {
    const suite = createSuite(
      /*isTyped=*/ false,
      new Map([
        [
          'NonParameterizedCase',
          {isParameterized: false, range: new vscode.Range(0, 0, 0, 0)},
        ],
        [
          'ParameterizedCase',
          {isParameterized: true, range: new vscode.Range(0, 0, 0, 0)},
        ],
      ])
    );
    expect(suite.getGtestFilter().split(':')).toEqual(
      jasmine.arrayWithExactContents([
        // value-parameterized with instantiation name
        '*/suite.*/*',
        // value-parameterized without instantiation name
        'suite.*/*',
        // non-parameterized
        'suite.*',
      ])
    );
  });

  it('calculates test filter of typed, non-parameterized test suite', () => {
    const suite = createSuite(
      /*isTyped=*/ true,
      new Map([
        [
          'NonParameterizedCase',
          {isParameterized: false, range: new vscode.Range(0, 0, 0, 0)},
        ],
      ])
    );
    expect(suite.getGtestFilter()).toBe('suite/*.*');
  });

  it('calculates test filter of typed, parameterized test suite', () => {
    const suite = createSuite(
      /*isTyped=*/ true,
      new Map([
        [
          'ParameterizedCase',
          {isParameterized: true, range: new vscode.Range(0, 0, 0, 0)},
        ],
      ])
    );
    expect(suite.getGtestFilter().split(':')).toEqual(
      jasmine.arrayWithExactContents([
        // with instantiation name
        '*/suite/*.*',
        // without instantiation name
        'suite/*.*',
      ])
    );
  });

  it('calculates test filter of typed, mixed test suite', () => {
    const suite = createSuite(
      /*isTyped=*/ true,
      new Map([
        [
          'NonParameterizedCase',
          {isParameterized: false, range: new vscode.Range(0, 0, 0, 0)},
        ],
        [
          'ParameterizedCase',
          {isParameterized: true, range: new vscode.Range(0, 0, 0, 0)},
        ],
      ])
    );
    expect(suite.getGtestFilter().split(':')).toEqual(
      jasmine.arrayWithExactContents([
        // type-parameterized with instantiation name
        '*/suite/*.*',
        // type-parameterized without instantiation name, or just typed
        'suite/*.*',
      ])
    );
  });
});
