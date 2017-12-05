import { ApolloClient, ApolloClientOptions} from 'apollo-client';
import { HttpLink, createHttpLink, } from 'apollo-link-http';
import { setContext } from 'apollo-link-context';
import { InMemoryCache, NormalizedCacheObject } from 'apollo-cache-inmemory';
import { ApolloCache } from 'apollo-cache';

interface RealmGraphQLClientConfig {
  /**
   * Should be the HTTP or HTTP endpoint of your server's graphql service endpoint
   * Example: http://localhost:9080/graphql
   */
  endpoint: string
}

/**
 * Named Blah for now. Replace it with something a lot more sexy later.
 */
class RealmGraphQLClient extends ApolloClient<NormalizedCacheObject> {

  constructor(config: RealmGraphQLClientConfig) {
    const httpLink = createHttpLink({
      uri: `${config.endpoint}`,
    });
    
    const authLink = setContext((_, { headers }) => {
      // get the authentication token from local storage if it exists
      const token = localStorage.getItem('token');
      // return the headers to the context so httpLink can read them
      return {
        headers: {
          ...headers,
          authorization: token ? `Bearer ${token}` : null,
        }
      }
    });
    super({
      link: authLink,
      cache: new InMemoryCache()
    })    
  }
}