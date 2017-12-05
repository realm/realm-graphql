import { InMemoryCache, NormalizedCacheObject } from 'apollo-cache-inmemory';
import { ApolloClient, ApolloClientOptions } from 'apollo-client';
import { DefaultOptions } from 'apollo-client/ApolloClient';
import { split } from 'apollo-link';
import { setContext } from 'apollo-link-context';
import { createHttpLink, } from 'apollo-link-http';
import { WebSocketLink } from 'apollo-link-ws';
import { getMainDefinition } from 'apollo-utilities';
import { SubscriptionClient } from 'subscriptions-transport-ws';
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

  /**
   * WebSocket implementation to provide to the subscription client.
   * Use this when your environment does not have a built-in native
   * WebSocket (for example, with NodeJS client).
   */
  webSocketImpl?: any;
}

export class RealmClient extends ApolloClient<NormalizedCacheObject> {
  public static async create(config: ClientConfig): Promise<RealmClient> {
    const accessToken = await AuthenticationHelper.refreshAccessToken(config.user, config.realmPath);
    return new RealmClient(config, accessToken.token);
  }

  private authUrl: string;
  private accessToken: string;

  private constructor(config: ClientConfig, accessToken: string) {
    const endpoint = new URI(config.user.server).segmentCoded(['graphql', config.realmPath]);

    const httpLink = createHttpLink({
      uri: endpoint.toString(),
      fetch: AuthenticationHelper.getFetch()
    });

    const authLink = setContext((_, { headers }) => {
      return {
        headers: {
          ...headers,
          authorization: this.accessToken ? this.accessToken : null,
        }
      };
    });

    let subscriptionScheme: string;
    switch (endpoint.scheme()) {
      case 'http':
        subscriptionScheme = 'ws';
        break;
      case 'https':
        subscriptionScheme = 'wss';
        break;
      default:
        throw new Error(`Unrecognized scheme for the server endpoint: ${endpoint.scheme()}`);
    }

    const subscriptionClient = new SubscriptionClient(endpoint.clone().scheme(subscriptionScheme).toString(), {
      connectionParams: () => {
        return {
          token: this.accessToken
        };
      },
      reconnect: true,
      lazy: true
    }, config.webSocketImpl);

    const subscriptionLink = new WebSocketLink(subscriptionClient);

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
