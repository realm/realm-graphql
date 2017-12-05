import { InMemoryCache, NormalizedCacheObject } from 'apollo-cache-inmemory';
import { ApolloClient, ApolloClientOptions } from 'apollo-client';
import { DefaultOptions } from 'apollo-client/ApolloClient';
import { split } from 'apollo-link';
import { setContext } from 'apollo-link-context';
import { createHttpLink, } from 'apollo-link-http';
import { WebSocketLink } from 'apollo-link-ws';
import { getMainDefinition } from 'apollo-utilities';
import * as URI from 'urijs';
import { AuthenticationHelper } from './authenticationHelper';
import { User } from './user';

export interface ClientConfig {
  user: User;
  realmPath: string;
  ssrMode?: boolean;
  ssrForceFetchDelay?: number;
  connectToDevTools?: boolean;
  queryDeduplication?: boolean;
  defaultOptions?: DefaultOptions;
}

export class RealmClient extends ApolloClient<NormalizedCacheObject> {
  public static async Create(config: ClientConfig): Promise<RealmClient> {
    const accessToken = await AuthenticationHelper.refreshAccessToken(config.user, config.realmPath);
    return new RealmClient(config, accessToken.token);
  }

  private authUrl: string;
  private accessToken: string;

  private constructor(config: ClientConfig, accessToken: string) {
    const endpoint = new URI(config.user.server).segmentCoded(['graphql', config.realmPath]);

    const httpLink = createHttpLink({
      uri: endpoint.toString(),
    });

    const authLink = setContext((_, { headers }) => {
      return {
        headers: {
          ...headers,
          authorization: this.accessToken ? this.accessToken : null,
        }
      };
    });

    // TODO: investigate how this works and what happens on token expiration
    const subscriptionLink = new WebSocketLink({
      uri: endpoint.clone().scheme('ws').toString(),
      options: {
        connectionParams: {
          token: accessToken
        }
      }
    });

    const link = split(({ query }) => {
        const { kind, operation } = getMainDefinition(query);
        return kind === 'OperationDefinition' && operation === 'subscription';
      },
      subscriptionLink,
      authLink.concat(httpLink));

    const baseConfig: ApolloClientOptions<NormalizedCacheObject> = {
      link,
      cache: new InMemoryCache()
    };

    Object.assign(baseConfig, config);

    super(baseConfig);

    // TODO: schedule access token refreshes.
    this.accessToken = accessToken;
  }
}
