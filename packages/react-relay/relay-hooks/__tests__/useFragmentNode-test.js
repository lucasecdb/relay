/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails oncall+relay
 * @flow
 * @format
 */

// flowlint ambiguous-object-type:error

'use strict';

const React = require('react');
const {useMemo, useState} = React;
const TestRenderer = require('react-test-renderer');

const useFragmentNodeOriginal = require('../useFragmentNode');
const ReactRelayContext = require('react-relay/ReactRelayContext');
const {
  FRAGMENT_OWNER_KEY,
  FRAGMENTS_KEY,
  ID_KEY,
  createOperationDescriptor,
  graphql,
  getRequest,
  getFragment,
} = require('relay-runtime');

const {createMockEnvironment} = require('relay-test-utils');

import type {OperationDescriptor} from 'relay-runtime';

function assertYieldsWereCleared(_scheduler) {
  const actualYields = _scheduler.unstable_clearYields();
  if (actualYields.length !== 0) {
    throw new Error(
      'Log of yielded values is not empty. ' +
        'Call expect(Scheduler).toHaveYielded(...) first.',
    );
  }
}

function expectSchedulerToFlushAndYield(expectedYields) {
  TestRenderer.act(() => {
    const Scheduler = require('scheduler');
    assertYieldsWereCleared(Scheduler);
    Scheduler.unstable_flushAllWithoutAsserting();
    const actualYields = Scheduler.unstable_clearYields();
    expect(actualYields).toEqual(expectedYields);
  });
}

function expectSchedulerToFlushAndYieldThrough(expectedYields) {
  TestRenderer.act(() => {
    const Scheduler = require('scheduler');
    assertYieldsWereCleared(Scheduler);
    Scheduler.unstable_flushNumberOfYields(expectedYields.length);
    const actualYields = Scheduler.unstable_clearYields();
    expect(actualYields).toEqual(expectedYields);
  });
}

let environment;
let disableStoreUpdates;
let enableStoreUpdates;
let gqlSingularQuery;
let gqlSingularFragment;
let gqlPluralQuery;
let gqlPluralFragment;
let singularQuery;
let pluralQuery;
let singularVariables;
let pluralVariables;
let setEnvironment;
let setSingularOwner;
let renderSingularFragment;
let renderPluralFragment;
let forceSingularUpdate;
let renderSpy;
let SingularRenderer;
let PluralRenderer;

function resetRenderMock() {
  renderSpy.mockClear();
}

function useFragmentNode(fragmentNode, fragmentRef) {
  const result = useFragmentNodeOriginal(
    fragmentNode,
    fragmentRef,
    'TestDisplayName',
  );
  const {data} = result;
  disableStoreUpdates = result.disableStoreUpdates;
  enableStoreUpdates = result.enableStoreUpdates;

  renderSpy(data);
  return [data];
}

function assertFragmentResults(
  expectedCalls: $ReadOnlyArray<{|data: $FlowFixMe|}>,
) {
  // This ensures that useEffect runs
  TestRenderer.act(() => jest.runAllImmediates());
  expect(renderSpy).toBeCalledTimes(expectedCalls.length);
  expectedCalls.forEach((expected, idx) => {
    const [actualData] = renderSpy.mock.calls[idx];
    expect(actualData).toEqual(expected.data);
  });
  renderSpy.mockClear();
}

function createFragmentRef(id, owner) {
  return {
    [ID_KEY]: id,
    [FRAGMENTS_KEY]: {
      useFragmentNodeTestNestedUserFragment: {},
    },
    [FRAGMENT_OWNER_KEY]: owner.request,
  };
}

beforeEach(() => {
  // Set up mocks
  jest.resetModules();
  jest.spyOn(console, 'warn').mockImplementationOnce(() => {});
  jest.mock('warning');
  jest.mock('scheduler', () => {
    return jest.requireActual('scheduler/unstable_mock');
  });
  renderSpy = jest.fn();

  // Set up environment and base data
  environment = createMockEnvironment();
  graphql`
    fragment useFragmentNodeTestNestedUserFragment on User {
      username
    }
  `;
  singularVariables = {id: '1', scale: 16};
  pluralVariables = {ids: ['1', '2'], scale: 16};
  gqlSingularQuery = getRequest(graphql`
    query useFragmentNodeTestUserQuery($id: ID!, $scale: Int!) {
      node(id: $id) {
        ...useFragmentNodeTestUserFragment
      }
    }
  `);
  gqlSingularFragment = getFragment(graphql`
    fragment useFragmentNodeTestUserFragment on User {
      id
      name
      profile_picture(scale: $scale) {
        uri
      }
      ...useFragmentNodeTestNestedUserFragment
    }
  `);
  gqlPluralQuery = getRequest(graphql`
    query useFragmentNodeTestUsersQuery($ids: [ID!]!, $scale: Int!) {
      nodes(ids: $ids) {
        ...useFragmentNodeTestUsersFragment
      }
    }
  `);
  gqlPluralFragment = getFragment(graphql`
    fragment useFragmentNodeTestUsersFragment on User @relay(plural: true) {
      id
      name
      profile_picture(scale: $scale) {
        uri
      }
      ...useFragmentNodeTestNestedUserFragment
    }
  `);
  singularQuery = createOperationDescriptor(
    gqlSingularQuery,
    singularVariables,
  );
  pluralQuery = createOperationDescriptor(gqlPluralQuery, pluralVariables);
  environment.commitPayload(singularQuery, {
    node: {
      __typename: 'User',
      id: '1',
      name: 'Alice',
      username: 'useralice',
      profile_picture: null,
    },
  });
  environment.commitPayload(pluralQuery, {
    nodes: [
      {
        __typename: 'User',
        id: '1',
        name: 'Alice',
        username: 'useralice',
        profile_picture: null,
      },
      {
        __typename: 'User',
        id: '2',
        name: 'Bob',
        username: 'userbob',
        profile_picture: null,
      },
    ],
  });

  // Set up renderers
  SingularRenderer = props => null;
  PluralRenderer = props => null;

  const SingularContainer = (props: {
    userRef?: {...},
    owner: OperationDescriptor,
    ...
  }) => {
    // We need a render a component to run a Hook
    const [owner, _setOwner] = useState<OperationDescriptor>(props.owner);
    const [, _setCount] = useState(0);
    const userRef = props.hasOwnProperty('userRef')
      ? props.userRef
      : {
          [ID_KEY]: owner.request.variables.id,
          [FRAGMENTS_KEY]: {
            useFragmentNodeTestUserFragment: {},
          },
          [FRAGMENT_OWNER_KEY]: owner.request,
        };

    setSingularOwner = _setOwner;
    forceSingularUpdate = () => _setCount(count => count + 1);

    const [userData] = useFragmentNode(gqlSingularFragment, userRef);
    return <SingularRenderer user={userData} />;
  };

  const PluralContainer = (props: {
    usersRef?: {...},
    owner: $FlowFixMe,
    ...
  }) => {
    // We need a render a component to run a Hook
    const owner = props.owner;
    const usersRef = props.hasOwnProperty('usersRef')
      ? props.usersRef
      : owner.request.variables.ids.map(id => ({
          [ID_KEY]: id,
          [FRAGMENTS_KEY]: {
            useFragmentNodeTestUsersFragment: {},
          },
          [FRAGMENT_OWNER_KEY]: owner.request,
        }));

    const [usersData] = useFragmentNode(gqlPluralFragment, usersRef);
    return <PluralRenderer users={usersData} />;
  };

  const ContextProvider = ({children}) => {
    const [env, _setEnv] = useState(environment);
    const relayContext = useMemo(() => ({environment: env}), [env]);

    setEnvironment = _setEnv;

    return (
      <ReactRelayContext.Provider value={relayContext}>
        {children}
      </ReactRelayContext.Provider>
    );
  };

  renderSingularFragment = (args?: {
    isConcurrent?: boolean,
    owner?: $FlowFixMe,
    userRef?: $FlowFixMe,
    ...
  }) => {
    const {isConcurrent = false, ...props} = args ?? {};
    return TestRenderer.create(
      <React.Suspense fallback="Singular Fallback">
        <ContextProvider>
          <SingularContainer owner={singularQuery} {...props} />
        </ContextProvider>
      </React.Suspense>,
      // $FlowFixMe[prop-missing] - error revealed when flow-typing ReactTestRenderer
      {unstable_isConcurrent: isConcurrent},
    );
  };

  renderPluralFragment = (args?: {
    isConcurrent?: boolean,
    owner?: $FlowFixMe,
    usersRef?: $FlowFixMe,
    ...
  }) => {
    const {isConcurrent = false, ...props} = args ?? {};
    return TestRenderer.create(
      <React.Suspense fallback="Plural Fallback">
        <ContextProvider>
          <PluralContainer owner={pluralQuery} {...props} />
        </ContextProvider>
      </React.Suspense>,
      // $FlowFixMe[prop-missing] - error revealed when flow-typing ReactTestRenderer
      {unstable_isConcurrent: isConcurrent},
    );
  };
});

afterEach(() => {
  environment.mockClear();
  renderSpy.mockClear();
});

it('should render singular fragment without error when data is available', () => {
  renderSingularFragment();
  assertFragmentResults([
    {
      data: {
        id: '1',
        name: 'Alice',
        profile_picture: null,
        ...createFragmentRef('1', singularQuery),
      },
    },
  ]);
});

it('should render singular fragment without error when ref is null', () => {
  renderSingularFragment({userRef: null});
  assertFragmentResults([
    {
      data: null,
    },
  ]);
});

it('should render singular fragment without error when ref is undefined', () => {
  renderSingularFragment({userRef: undefined});
  assertFragmentResults([
    {
      data: null,
    },
  ]);
});

it('should render plural fragment without error when data is available', () => {
  renderPluralFragment();
  assertFragmentResults([
    {
      data: [
        {
          id: '1',
          name: 'Alice',
          profile_picture: null,
          ...createFragmentRef('1', pluralQuery),
        },
        {
          id: '2',
          name: 'Bob',
          profile_picture: null,
          ...createFragmentRef('2', pluralQuery),
        },
      ],
    },
  ]);
});

it('should render plural fragment without error when plural field is empty', () => {
  renderPluralFragment({usersRef: []});
  assertFragmentResults([
    {
      data: [],
    },
  ]);
});

it('should render plural fragment with a constant reference when plural field is empty', () => {
  renderPluralFragment({usersRef: []});
  renderPluralFragment({usersRef: []});

  expect(renderSpy.mock.calls).toHaveLength(2);
  const [[firstRender], [secondRender]] = renderSpy.mock.calls;
  expect(firstRender).toBe(secondRender);
});

it('should update when fragment data changes', () => {
  renderSingularFragment();
  assertFragmentResults([
    {
      data: {
        id: '1',
        name: 'Alice',
        profile_picture: null,
        ...createFragmentRef('1', singularQuery),
      },
    },
  ]);

  TestRenderer.act(() => {
    environment.commitPayload(singularQuery, {
      node: {
        __typename: 'User',
        id: '1',
        // Update name
        name: 'Alice in Wonderland',
      },
    });
  });
  assertFragmentResults([
    {
      data: {
        id: '1',
        // Assert that name is updated
        name: 'Alice in Wonderland',
        profile_picture: null,
        ...createFragmentRef('1', singularQuery),
      },
    },
  ]);
});

it('should preserve object identity when fragment data changes', () => {
  renderSingularFragment();
  TestRenderer.act(() => jest.runAllImmediates());
  expect(renderSpy).toBeCalledTimes(1);
  const prevData = renderSpy.mock.calls[0][0];
  expect(prevData).toEqual({
    id: '1',
    name: 'Alice',
    profile_picture: null,
    ...createFragmentRef('1', singularQuery),
  });
  renderSpy.mockClear();

  TestRenderer.act(() => {
    environment.commitPayload(singularQuery, {
      node: {
        __typename: 'User',
        id: '1',
        // Update name
        name: 'Alice in Wonderland',
      },
    });
  });
  TestRenderer.act(() => jest.runAllImmediates());
  expect(renderSpy).toBeCalledTimes(1);
  const nextData = renderSpy.mock.calls[0][0];
  expect(nextData).toEqual({
    id: '1',
    // Assert that name is updated
    name: 'Alice in Wonderland',
    profile_picture: null,
    ...createFragmentRef('1', singularQuery),
  });
  expect(nextData.__fragments).toBe(prevData.__fragments);
});

it('should re-read and resubscribe to fragment when environment changes', () => {
  renderSingularFragment();
  assertFragmentResults([
    {
      data: {
        id: '1',
        name: 'Alice',
        profile_picture: null,
        ...createFragmentRef('1', singularQuery),
      },
    },
  ]);

  const newEnvironment = createMockEnvironment();
  newEnvironment.commitPayload(singularQuery, {
    node: {
      __typename: 'User',
      id: '1',
      name: 'Alice in a different env',
      profile_picture: null,
    },
  });

  TestRenderer.act(() => {
    setEnvironment(newEnvironment);
  });

  const expectedUser = {
    id: '1',
    name: 'Alice in a different env',
    profile_picture: null,
    ...createFragmentRef('1', singularQuery),
  };
  assertFragmentResults([{data: expectedUser}]);

  TestRenderer.act(() => {
    newEnvironment.commitPayload(singularQuery, {
      node: {
        __typename: 'User',
        id: '1',
        // Update name
        name: 'Alice in Wonderland',
      },
    });
  });
  assertFragmentResults([
    {
      data: {
        id: '1',
        // Assert that name is updated
        name: 'Alice in Wonderland',
        profile_picture: null,
        ...createFragmentRef('1', singularQuery),
      },
    },
  ]);
});

it('should re-read and resubscribe to fragment when fragment pointers change', () => {
  renderSingularFragment();
  assertFragmentResults([
    {
      data: {
        id: '1',
        name: 'Alice',
        profile_picture: null,
        ...createFragmentRef('1', singularQuery),
      },
    },
  ]);

  const newVariables = {...singularVariables, id: '200'};
  const newQuery = createOperationDescriptor(gqlSingularQuery, newVariables);
  environment.commitPayload(newQuery, {
    node: {
      __typename: 'User',
      id: '200',
      name: 'Foo',
      profile_picture: null,
      username: 'userfoo',
    },
  });

  TestRenderer.act(() => {
    setSingularOwner(newQuery);
  });

  const expectedUser = {
    // Assert updated data
    id: '200',
    name: 'Foo',
    profile_picture: null,
    // Assert that ref now points to newQuery owner
    ...createFragmentRef('200', newQuery),
  };
  assertFragmentResults([{data: expectedUser}]);

  TestRenderer.act(() => {
    environment.commitPayload(newQuery, {
      node: {
        __typename: 'User',
        id: '200',
        // Update name
        name: 'Foo Updated',
      },
    });
  });
  assertFragmentResults([
    {
      data: {
        id: '200',
        // Assert that name is updated
        name: 'Foo Updated',
        profile_picture: null,
        ...createFragmentRef('200', newQuery),
      },
    },
  ]);
});

it('should render correct data when changing fragment refs multiple times', () => {
  // Render component with data for ID 1
  renderSingularFragment();
  assertFragmentResults([
    {
      data: {
        id: '1',
        name: 'Alice',
        profile_picture: null,
        ...createFragmentRef('1', singularQuery),
      },
    },
  ]);

  // Update fragment refs to render data for ID 200
  const newVariables = {...singularVariables, id: '200'};
  const newQuery = createOperationDescriptor(gqlSingularQuery, newVariables);
  environment.commitPayload(newQuery, {
    node: {
      __typename: 'User',
      id: '200',
      name: 'Foo',
      username: 'userfoo',
      profile_picture: null,
    },
  });

  TestRenderer.act(() => {
    setSingularOwner(newQuery);
  });

  let expectedUser = {
    // Assert updated data
    id: '200',
    name: 'Foo',
    profile_picture: null,
    // Assert that ref now points to newQuery owner
    ...createFragmentRef('200', newQuery),
  };
  assertFragmentResults([{data: expectedUser}]);

  // Udpate data for ID 1
  environment.commitPayload(singularQuery, {
    node: {
      __typename: 'User',
      id: '1',
      // Update name
      name: 'Alice in Wonderland',
    },
  });

  // Switch back to rendering data for ID 1
  TestRenderer.act(() => {
    setSingularOwner(singularQuery);
  });

  // We expect to see the latest data
  expectedUser = {
    // Assert updated data
    id: '1',
    name: 'Alice in Wonderland',
    profile_picture: null,
    // Assert that ref points to original singularQuery owner
    ...createFragmentRef('1', singularQuery),
  };
  assertFragmentResults([{data: expectedUser}]);

  // Assert it correctly subscribes to new data
  TestRenderer.act(() => {
    environment.commitPayload(singularQuery, {
      node: {
        __typename: 'User',
        id: '1',
        // Update name
        name: 'Alice Updated',
      },
    });
  });
  assertFragmentResults([
    {
      data: {
        id: '1',
        // Assert anme is updated
        name: 'Alice Updated',
        profile_picture: null,
        ...createFragmentRef('1', singularQuery),
      },
    },
  ]);
});

it('should ignore updates to initially rendered data when fragment pointers change', () => {
  const Scheduler = require('scheduler');
  const YieldChild = props => {
    // NOTE the unstable_yield method will move to the static renderer.
    // When React sync runs we need to update this.
    Scheduler.unstable_yieldValue(props.children);
    return props.children;
  };
  const YieldyUserComponent = ({user}) => (
    <>
      <YieldChild>Hey user,</YieldChild>
      <YieldChild>{user.name}</YieldChild>
      <YieldChild>with id {user.id}!</YieldChild>
    </>
  );

  // Assert initial render
  SingularRenderer = YieldyUserComponent;
  renderSingularFragment({isConcurrent: true});
  expectSchedulerToFlushAndYield([
    'Hey user,',
    'Alice',
    ['with id ', '1', '!'],
  ]);
  assertFragmentResults([
    {
      data: {
        id: '1',
        name: 'Alice',
        profile_picture: null,
        ...createFragmentRef('1', singularQuery),
      },
    },
  ]);

  const newVariables = {...singularVariables, id: '200'};
  const newQuery = createOperationDescriptor(gqlSingularQuery, newVariables);
  TestRenderer.act(() => {
    environment.commitPayload(newQuery, {
      node: {
        __typename: 'User',
        id: '200',
        name: 'Foo',
        username: 'userfoo',
        profile_picture: null,
      },
    });
  });

  TestRenderer.act(() => {
    // Pass new fragment ref that points to new ID 200
    setSingularOwner(newQuery);

    // Flush some of the changes, but don't commit
    expectSchedulerToFlushAndYieldThrough(['Hey user,', 'Foo']);

    // In Concurrent mode component gets rendered even if not committed
    // so we reset our mock here
    resetRenderMock();

    // Trigger an update for initially rendered data while second
    // render is in progress
    environment.commitPayload(singularQuery, {
      node: {
        __typename: 'User',
        id: '1',
        name: 'Alice in Wonderland',
      },
    });

    // Assert the component renders the data from newQuery/newVariables,
    // ignoring any updates triggered while render was in progress
    expectSchedulerToFlushAndYield([
      ['with id ', '200', '!'],
      'Hey user,',
      'Foo',
      ['with id ', '200', '!'],
    ]);
    assertFragmentResults([
      {
        data: {
          id: '200',
          name: 'Foo',
          profile_picture: null,
          ...createFragmentRef('200', newQuery),
        },
      },
    ]);

    // Update latest rendered data
    environment.commitPayload(newQuery, {
      node: {
        __typename: 'User',
        id: '200',
        // Update name
        name: 'Foo Updated',
      },
    });
    expectSchedulerToFlushAndYield([
      'Hey user,',
      'Foo Updated',
      ['with id ', '200', '!'],
    ]);
    assertFragmentResults([
      {
        data: {
          id: '200',
          // Assert name is updated
          name: 'Foo Updated',
          profile_picture: null,
          ...createFragmentRef('200', newQuery),
        },
      },
    ]);
  });
});

it('should re-read and resubscribe to fragment when variables change', () => {
  renderSingularFragment();
  assertFragmentResults([
    {
      data: {
        id: '1',
        name: 'Alice',
        profile_picture: null,
        ...createFragmentRef('1', singularQuery),
      },
    },
  ]);

  const newVariables = {...singularVariables, id: '1', scale: 32};
  const newQuery = createOperationDescriptor(gqlSingularQuery, newVariables);
  environment.commitPayload(newQuery, {
    node: {
      __typename: 'User',
      id: '1',
      name: 'Alice',
      profile_picture: {
        uri: 'uri32',
      },
      username: 'useralice',
    },
  });

  TestRenderer.act(() => {
    setSingularOwner(newQuery);
  });

  const expectedUser = {
    id: '1',
    name: 'Alice',
    profile_picture: {
      // Asset updated uri
      uri: 'uri32',
    },
    // Assert that ref now points to newQuery owner
    ...createFragmentRef('1', newQuery),
  };
  assertFragmentResults([{data: expectedUser}]);

  TestRenderer.act(() => {
    environment.commitPayload(newQuery, {
      node: {
        __typename: 'User',
        id: '1',
        // Update name
        name: 'Alice in Wonderland',
      },
    });
  });
  assertFragmentResults([
    {
      data: {
        id: '1',
        // Assert that name is updated
        name: 'Alice in Wonderland',
        profile_picture: {
          uri: 'uri32',
        },
        ...createFragmentRef('1', newQuery),
      },
    },
  ]);
});

it('should ignore updates to initially rendered data when variables change', () => {
  const Scheduler = require('scheduler');
  const YieldChild = props => {
    Scheduler.unstable_yieldValue(props.children);
    return props.children;
  };
  const YieldyUserComponent = ({user}) => (
    <>
      <YieldChild>Hey user,</YieldChild>
      <YieldChild>{user.profile_picture?.uri ?? 'no uri'}</YieldChild>
      <YieldChild>with id {user.id}!</YieldChild>
    </>
  );

  // Assert initial render
  SingularRenderer = YieldyUserComponent;
  renderSingularFragment({isConcurrent: true});
  expectSchedulerToFlushAndYield([
    'Hey user,',
    'no uri',
    ['with id ', '1', '!'],
  ]);
  assertFragmentResults([
    {
      data: {
        id: '1',
        name: 'Alice',
        profile_picture: null,
        ...createFragmentRef('1', singularQuery),
      },
    },
  ]);

  const newVariables = {...singularVariables, id: '1', scale: 32};
  const newQuery = createOperationDescriptor(gqlSingularQuery, newVariables);
  TestRenderer.act(() => {
    environment.commitPayload(newQuery, {
      node: {
        __typename: 'User',
        id: '1',
        name: 'Alice',
        username: 'useralice',
        profile_picture: {
          uri: 'uri32',
        },
      },
    });
  });

  TestRenderer.act(() => {
    // Pass new fragment ref which contains newVariables
    setSingularOwner(newQuery);

    // Flush some of the changes, but don't commit
    expectSchedulerToFlushAndYieldThrough(['Hey user,', 'uri32']);

    // In Concurrent mode component gets rendered even if not committed
    // so we reset our mock here
    resetRenderMock();

    // Trigger an update for initially rendered data while second
    // render is in progress
    environment.commitPayload(singularQuery, {
      node: {
        __typename: 'User',
        id: '1',
        // Update name
        name: 'Alice',
        // Update profile_picture value
        profile_picture: {
          uri: 'uri16',
        },
      },
    });

    // Assert the component renders the data from newQuery/newVariables,
    // ignoring any updates triggered while render was in progress
    expectSchedulerToFlushAndYield([
      ['with id ', '1', '!'],
      'Hey user,',
      'uri32',
      ['with id ', '1', '!'],
    ]);
    assertFragmentResults([
      {
        data: {
          id: '1',
          name: 'Alice',
          profile_picture: {
            uri: 'uri32',
          },
          ...createFragmentRef('1', newQuery),
        },
      },
    ]);

    // Update latest rendered data
    environment.commitPayload(newQuery, {
      node: {
        __typename: 'User',
        id: '1',
        // Update name
        name: 'Alice latest update',
      },
    });
    expectSchedulerToFlushAndYield([
      'Hey user,',
      'uri32',
      ['with id ', '1', '!'],
    ]);
    assertFragmentResults([
      {
        data: {
          id: '1',
          // Assert name is updated
          name: 'Alice latest update',
          profile_picture: {
            uri: 'uri32',
          },
          ...createFragmentRef('1', newQuery),
        },
      },
    ]);
  });
});

it('should NOT update if fragment refs dont change', () => {
  renderSingularFragment();
  assertFragmentResults([
    {
      data: {
        id: '1',
        name: 'Alice',
        profile_picture: null,
        ...createFragmentRef('1', singularQuery),
      },
    },
  ]);

  // Force a re-render with the exact same fragment refs
  TestRenderer.act(() => {
    forceSingularUpdate();
  });

  assertFragmentResults([
    {
      data: {
        id: '1',
        name: 'Alice',
        profile_picture: null,
        ...createFragmentRef('1', singularQuery),
      },
    },
  ]);
});

it('should NOT update even if fragment ref changes but doesnt point to a different ID', () => {
  renderSingularFragment();
  assertFragmentResults([
    {
      data: {
        id: '1',
        name: 'Alice',
        profile_picture: null,
        ...createFragmentRef('1', singularQuery),
      },
    },
  ]);

  // Setting a new owner with the same query/variables will cause new
  // fragment refs that point to the same IDs to be passed
  const newOwner = createOperationDescriptor(
    gqlSingularQuery,
    singularVariables,
  );
  TestRenderer.act(() => {
    setSingularOwner(newOwner);
  });

  assertFragmentResults([
    {
      data: {
        id: '1',
        name: 'Alice',
        profile_picture: null,
        ...createFragmentRef('1', singularQuery),
      },
    },
  ]);
});

it('should throw a promise if if data is missing for fragment and request is in flight', () => {
  // This prevents console.error output in the test, which is expected
  jest.spyOn(console, 'error').mockImplementationOnce(() => {});
  jest
    .spyOn(require('relay-runtime').__internal, 'getPromiseForActiveRequest')
    .mockImplementationOnce(() => Promise.resolve());

  const missingDataVariables = {...singularVariables, id: '4'};
  const missingDataQuery = createOperationDescriptor(
    gqlSingularQuery,
    missingDataVariables,
  );
  // Commit a payload with name and profile_picture are missing
  environment.commitPayload(missingDataQuery, {
    node: {
      __typename: 'User',
      id: '4',
    },
  });

  const renderer = renderSingularFragment({owner: missingDataQuery});
  expect(renderer.toJSON()).toEqual('Singular Fallback');
});

it('should warn if fragment reference is non-null but read-out data is null', () => {
  // Clearing the data in the environment will make it so the fragment ref
  // we pass to useFragmentNode points to data that does not exist; we expect
  // an error to be thrown in this case.
  (environment.getStore().getSource(): $FlowFixMe).clear();
  const warning = require('warning');
  // $FlowFixMe[prop-missing]
  warning.mockClear();

  renderSingularFragment();
  expect(warning).toBeCalledTimes(1);
  // $FlowFixMe[prop-missing]
  const [, warningMessage] = warning.mock.calls[0];
  expect(
    warningMessage.startsWith(
      'Relay: Expected to have been able to read non-null data for fragment `%s`',
    ),
  ).toEqual(true);
  // $FlowFixMe[prop-missing]
  warning.mockClear();
});

it('should NOT warn if plural fragment reference is non-null and empty', () => {
  // Commit a paylaod where the nodes are an empty list
  environment.commitPayload(pluralQuery, {
    nodes: [],
  });
  const warning = require('warning');
  // $FlowFixMe[prop-missing]
  warning.mockClear();

  // Pass the updated fragment ref
  const usersRef = (environment.lookup(pluralQuery.fragment).data: $FlowFixMe)
    .nodes;
  renderPluralFragment({usersRef});
  expect(warning).toBeCalledTimes(0);

  // $FlowFixMe[prop-missing]
  warning.mockClear();
});

it('should warn if plural fragment reference is non-null but read-out data is null', () => {
  // Clearing the data in the environment will make it so the fragment ref
  // we pass to useFragmentNode points to data that does not exist; we expect
  // an error to be thrown in this case.
  (environment.getStore().getSource(): $FlowFixMe).clear();
  const warning = require('warning');
  // $FlowFixMe[prop-missing]
  warning.mockClear();

  renderPluralFragment();
  expect(warning).toBeCalledTimes(1);
  // $FlowFixMe[prop-missing]
  const [, warningMessage] = warning.mock.calls[0];
  expect(
    warningMessage.startsWith(
      'Relay: Expected to have been able to read non-null data for fragment `%s`',
    ),
  ).toEqual(true);
  // $FlowFixMe[prop-missing]
  warning.mockClear();
});

it('should subscribe for updates even if there is missing data', () => {
  // This prevents console.error output in the test, which is expected
  jest.spyOn(console, 'error').mockImplementationOnce(() => {});
  const warning = require('warning');

  const missingDataVariables = {...singularVariables, id: '4'};
  const missingDataQuery = createOperationDescriptor(
    gqlSingularQuery,
    missingDataVariables,
  );

  // Commit a payload where name is missing.
  environment.commitPayload(missingDataQuery, {
    node: {
      __typename: 'User',
      id: '4',
    },
  });

  // $FlowFixMe[prop-missing]
  warning.mockClear();
  renderSingularFragment({owner: missingDataQuery});

  // Assert render output with missing data
  assertFragmentResults([
    {
      data: {
        id: '4',
        name: undefined,
        profile_picture: undefined,
        ...createFragmentRef('4', missingDataQuery),
      },
    },
  ]);

  // Commit a payload with updated name.
  environment.commitPayload(missingDataQuery, {
    node: {
      __typename: 'User',
      id: '4',
      name: 'Mark',
    },
  });

  // Assert render output with updated data
  assertFragmentResults([
    {
      data: {
        id: '4',
        name: 'Mark',
        profile_picture: undefined,
        ...createFragmentRef('4', missingDataQuery),
      },
    },
  ]);
});

it('should subscribe for updates to plural fragments even if there is missing data', () => {
  // This prevents console.error output in the test, which is expected
  jest.spyOn(console, 'error').mockImplementationOnce(() => {});
  const warning = require('warning');

  const missingDataVariables = {...pluralVariables, ids: ['4']};
  const missingDataQuery = createOperationDescriptor(
    gqlPluralQuery,
    missingDataVariables,
  );

  // Commit a payload where name is missing.
  environment.commitPayload(missingDataQuery, {
    nodes: [
      {
        __typename: 'User',
        id: '4',
      },
    ],
  });

  // $FlowFixMe[prop-missing]
  warning.mockClear();
  renderPluralFragment({owner: missingDataQuery});

  // Assert render output with missing data
  assertFragmentResults([
    {
      data: [
        {
          id: '4',
          name: undefined,
          profile_picture: undefined,
          ...createFragmentRef('4', missingDataQuery),
        },
      ],
    },
  ]);

  // Commit a payload with updated name.
  environment.commitPayload(missingDataQuery, {
    nodes: [
      {
        __typename: 'User',
        id: '4',
        name: 'Mark',
      },
    ],
  });

  // Assert render output with updated data
  assertFragmentResults([
    {
      data: [
        {
          id: '4',
          name: 'Mark',
          profile_picture: undefined,
          ...createFragmentRef('4', missingDataQuery),
        },
      ],
    },
  ]);
});

describe('disableStoreUpdates', () => {
  it('does not listen to store updates after disableStoreUpdates is called', () => {
    renderSingularFragment();
    assertFragmentResults([
      {
        data: {
          id: '1',
          name: 'Alice',
          profile_picture: null,
          ...createFragmentRef('1', singularQuery),
        },
      },
    ]);

    disableStoreUpdates();

    // Update data in the store
    environment.commitPayload(singularQuery, {
      node: {
        __typename: 'User',
        id: '1',
        name: 'Alice updated',
      },
    });

    // Assert that component did not re-render
    TestRenderer.act(() => jest.runAllImmediates());
    expect(renderSpy).toBeCalledTimes(0);
  });

  it('re-renders with latest data after re-enabling updates, if any updates were missed', () => {
    renderSingularFragment();
    assertFragmentResults([
      {
        data: {
          id: '1',
          name: 'Alice',
          profile_picture: null,
          ...createFragmentRef('1', singularQuery),
        },
      },
    ]);

    disableStoreUpdates();

    // Update data in the store
    environment.commitPayload(singularQuery, {
      node: {
        __typename: 'User',
        id: '1',
        name: 'Alice updated',
      },
    });

    // Assert that component did not re-render while updates are disabled
    TestRenderer.act(() => {
      jest.runAllImmediates();
    });
    expect(renderSpy).toBeCalledTimes(0);

    TestRenderer.act(() => {
      enableStoreUpdates();
    });

    // Assert that component re-renders with latest updated data
    assertFragmentResults([
      {
        data: {
          id: '1',
          name: 'Alice updated',
          profile_picture: null,
          ...createFragmentRef('1', singularQuery),
        },
      },
    ]);
  });

  it('does not re-render after re-enabling updates, if no updates were missed', () => {
    renderSingularFragment();
    assertFragmentResults([
      {
        data: {
          id: '1',
          name: 'Alice',
          profile_picture: null,
          ...createFragmentRef('1', singularQuery),
        },
      },
    ]);

    disableStoreUpdates();
    expect(renderSpy).toBeCalledTimes(0);

    enableStoreUpdates();

    // Assert that component did not re-render after enabling updates
    TestRenderer.act(() => jest.runAllImmediates());
    expect(renderSpy).toBeCalledTimes(0);
  });

  it('does not re-render after re-enabling updates, if data did not change', () => {
    renderSingularFragment();
    assertFragmentResults([
      {
        data: {
          id: '1',
          name: 'Alice',
          profile_picture: null,
          ...createFragmentRef('1', singularQuery),
        },
      },
    ]);

    disableStoreUpdates();

    environment.commitPayload(singularQuery, {
      node: {
        __typename: 'User',
        id: '1',
        name: 'Alice',
      },
    });

    TestRenderer.act(() => jest.runAllImmediates());
    expect(renderSpy).toBeCalledTimes(0);

    enableStoreUpdates();

    // Assert that component did not re-render after enabling updates
    TestRenderer.act(() => jest.runAllImmediates());
    expect(renderSpy).toBeCalledTimes(0);
  });
});
