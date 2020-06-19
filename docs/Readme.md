## Realm GraphQL

This client library provides helper classes that make it easier to consume
the Realm Object Server GraphQL API with the [Apollo GraphQL client](https://www.apollographql.com/client).

Here's a minimal getting started example:

```ts
const credentials = Credentials.usernamePassword('SOME-USERNAME', 'SOME-PASSWORD');
const user = await User.authenticate(credentials, 'http://my-ros-instance:9080');

const config = await GraphQLConfig.create( 
  user,
  `/~/test`
);

const httpLink = concat(
    config.authLink,
    // Note: if using node.js, you'll need to provide fetch as well.
    new HttpLink({ uri: config.httpEndpoint })
  );

// Note: if using node.js, you'll need to provide webSocketImpl as well.
const subscriptionLink = new WebSocketLink({
  uri: config.webSocketEndpoint,
  options: {
    connectionParams: config.connectionParams,
  }
});

const link = split(({ query }) => {
    const { kind, operation } = getMainDefinition(query);
    return kind === 'OperationDefinition' && operation === 'subscription';
  },
  subscriptionLink,
  httpLink
);

client = new ApolloClient({
  link: link,
  cache: new InMemoryCache()
});

// You can now query the GraphQL API
const response = await client.query({
  query: gql`
    query {
      people(query: "age > 18", sortBy: "name") {
        name
        age
      }
    }
  `
});

const people = response.data.people;
```
