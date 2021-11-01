# Realm GraphQL Client

With the introduction of [MongoDB Realm](https://www.mongodb.com/realm), this package is **deprecated**. Please use [MongoDB Realm Cloud](https://docs.mongodb.com/realm/) and the [GraphQL API](https://docs.mongodb.com/realm/graphql/).

A set of helper methods and classes to make it easier to use the Apollo GraphQL client with the Realm Object Server.

## Using the Client

The Realm GraphQL client provides a few helper and convenience API to make it easier to consume the [Realm Object Server GraphQL API](https://github.com/realm/realm-graphql-service) with the [Apollo Client](https://www.apollographql.com/client).

### Prerequisites

Add the [apollo-link](https://www.npmjs.com/package/apollo-link), [apollo-link-http](https://www.npmjs.com/package/apollo-link-http), [apollo-link-ws](https://www.npmjs.com/package/apollo-link-ws), and [subscriptions-transport-ws](https://www.npmjs.com/package/subscriptions-transport-ws) packages to your project:

```
npm install graphql apollo-link apollo-link-http apollo-link-ws apollo-utilities subscriptions-transport-ws --save
```

Then, add the Realm GraphQL client package:

```
npm install realm-graphql-client --save
```

### Getting Started

#### Authenticating the user

To start consuming the GraphQL API, you'll need to login a user:

```ts
import { Credentials, User } from 'realm-graphql-client';

const credentials = Credentials.usernamePassword('SOME-USERNAME', 'SOME-PASSWORD');
const user = await User.authenticate(credentials, 'http://my-ros-instance:9080');
```

Other credential providers are supported, such as JWT, Facebook, Google etc. They are all exposed as factories on the `Credentials` class.

After you have your user, you can create a helper config that will handle token refreshes and authentication:

```ts
import { GraphQLConfig } from 'realm-graphql-client';

const config = await GraphQLConfig.create(
  user,
  '/~/test'
);
```

Note that each config is created per Realm path, so if you need to query multiple Realms, you'll need to obtain a config instance for each of them.

#### Setting up the Client

Once you have a config, you can use that to create an Apollo client instance and configure it. The config exposes 4 properties:

- `httpEndpoint`: This is the endpoint you'll use to execute queries and mutations against.
It can be used to configure Apollo's [httpLink](https://www.apollographql.com/docs/link/links/http.html).
- `authLink`: This is a link that provides an Authorization header for the user/path combination.
It should be composed together with your `httpLink`.
- `webSocketEndpoint`: This is the endpoint you'll use to execute subscriptions against. It can be
used to configure Apollo's [WebSocket Link](https://www.apollographql.com/docs/link/links/ws.html).
- `connectionParams`: This is a function that will provide an authorization object each time a
websocket connection is established. You should pass that directly (without invoking it) to the
WebSocketLink's constructor's options.

Let's look at a small example. First, let's configure the `httpLink` that we'll use for querying and mutating:

```ts
import { HttpLink } from 'apollo-link-http';
import { concat } from 'apollo-link';

const httpLink = concat(
    config.authLink,
    // Note: if using node.js, you'll need to provide fetch as well.
    new HttpLink({ uri: config.httpEndpoint })
  );
```

Then, let's configure the websocket link that we'll use for subscriptions:

```ts
import { WebSocketLink } from 'apollo-link-ws';

// Note: if using node.js, you'll need to provide webSocketImpl as well.
const webSocketLink = new WebSocketLink({
  uri: config.webSocketEndpoint,
  options: {
    connectionParams: config.connectionParams,
  }
});
```

Finally, we need to use [split](https://www.apollographql.com/docs/link/composition.html#directional) to direct subscriptions to the websocket link and queries and mutations to the http link:

```ts
import { split } from 'apollo-link';
import { getMainDefinition } from 'apollo-utilities';

const link = split(
  ({ query }) => {
    const { kind, operation } = getMainDefinition(query);
    return kind === 'OperationDefinition' && operation === 'subscription';
  },
  webSocketLink,
  httpLink,
);

// Finally, create the client
client = new ApolloClient({
  link: link,
  cache: new InMemoryCache()
});
```

### Using the client

Now that you have configured your client, you can use to access the ROS GraphQL API.

#### Queries

Querying data is as simple as invoking `client.query()`:

```ts
const query = gql`
  query {
    companies {
      companyId
      name
      address
    }
  }
`;

const response = await client.query({
  query: query
});

const companies = response.data.companies;
```

For a complete list of supported query operations, refer to the [GraphQL Server docs](https://github.com/realm/realm-object-server-graphql#querying).

For a detailed documentation on the Apollo Client query capabilities, refer to the [Apollo docs](https://www.apollographql.com/docs/angular/basics/queries.html).

For a comprehensive documentation on the query language syntax, refer to the [Realm JS Query Language docs](https://github.com/realm/realm-js/blob/master/docs/tutorials/query-language.md#backlink-queries).

**Note**: Server Realms (used by GraphQL) don't have named backlinks, even if the client Realms had them defined, so you'll need to use the fully qualified backlink syntax, e.g.:

```json
{
  golfers(query: "@links.Club.golfers.id = 'some-club-id'") {
    firstName
    lastName
  }
}
```

#### Mutations

Mutating data happens when you invoke the `client.mutate()` method:

```ts
const mutation = gql`
  mutation {
    result: addCompany(input: {
      companyId: "some-unique-id"
      name: "My Amazing Company"
      address: "Mars"
    }) {
      companyId
      name
      address
    }
  }
`

const response = await client.mutate({
  mutation: mutation
});

const addedCompany = response.data.result;
```

For a complete list of supported mutation operations, refer to the [GraphQL Server docs](https://github.com/realm/realm-object-server-graphql#mutating).

For a detailed documentation on the Apollo Client query capabilities, refer to the [Apollo docs](https://www.apollographql.com/docs/angular/basics/mutations.html).

#### Subscriptions

Subscribing for changes happens when you invoke the `client.subscribe()` method. You get
an `Observable` sequence you can then add an observer to:

```ts
const observable = await client.subscribe({
  query: gql`
    subscription {
      companies${additionalParameters || ''} {
        companyId
        name
        address
      }
    }
  `
});

observable.subscribe({
  next(data) {
    const companies = data.data.companies;
    // Update you UI
  },
  error(value) {
    // Notify the user of the failure
  }
});
```

For a complete list of supported mutation operations, refer to the [GraphQL Server docs](https://github.com/realm/realm-object-server-graphql#subscribing).

For a detailed documentation on the Apollo Client query capabilities, refer to the [Apollo docs](https://www.apollographql.com/docs/angular/features/subscriptions.html).


## Developing the client

### Commands for Building, Cleaning, Testing, Linting and Watching

After `npm install`

1. To Build `npm run build`
2. To Clean Artifacts `npm run clean`
3. To Test `npm run test`
4. To Lint `npm run lint`
5. To Buld and Watch when you make changes `npm run watch`

### Debugging with Visual Studio Code

1. Set a breakpoint in your code ending in `.ts` or your test ending in `.spec.ts`
2. Run Either `src/index.ts` or `All Tests` in the debug pane.

### Some Advice

Never use arrow functions on the `Mocha` test handlers. Why? The callback has its own set of methods. The arrow function does not have an easy way to reference `this`

Say you want to increase the timeout of the function callback in your tests

```javascript
it('should do something', () => {
    this.timeout(2000) // this is not the callback function!
})
```
