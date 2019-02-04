import { ApolloLink, from, split } from 'apollo-link';
import { setContext } from 'apollo-link-context';
import * as URI from 'urijs';

import { ApolloCache } from 'apollo-cache';
import { InMemoryCache, NormalizedCacheObject } from 'apollo-cache-inmemory';
import ApolloClient from 'apollo-client';
import { createHttpLink } from 'apollo-link-http';
import { RetryLink } from 'apollo-link-retry';
import { WebSocketLink } from 'apollo-link-ws';
import { getMainDefinition } from 'apollo-utilities';
import * as fetch from 'isomorphic-fetch';
import * as ws from 'isomorphic-ws';
import { ConnectionParams } from 'subscriptions-transport-ws';
import { AccessToken, AuthenticationHelper } from './AuthenticationHelper';
import { User } from './User';

/**
 * A helper class, that handles user authentication over http and web socket connections.
 * It exposes properties that make it easier to setup an Apollo client to communicate with
 * the Realm Object Server GraphQL API.
 *
 * **Note**: A single configuration is valid for a single Realm path.
 *
 * @example
 * ```js
 *
 * const config = await GraphQLConfig.create(user, '/~/foo');
 *
 * const httpLink = ApolloLink.concat(
 *   config.authLink,
 *   new HttpLink({ uri: config.httpEndpoint }));
 *
 * const subscriptionLink = new WebSocketLink({
 *   uri: config.webSocketEndpoint,
 *   options: {
 *     connectionParams: config.connectionParams
 *   }
 * });
 *
 * // Hybrid mode - subscriptions go over websocket,
 * // queries and mutations - over http.
 * const link = split(({ query }) => {
 *     const { kind, operation } = getMainDefinition(query);
 *     return kind === 'OperationDefinition' && operation === 'subscription';
 *   },
 *   subscriptionLink,
 *   httpLink);
 *
 * client = new ApolloClient({
 *   link: link,
 *   cache: new InMemoryCache()
 * });
 * ```
 */
export class GraphQLConfig {
  /**
   * Creates a new `GraphQLConfig` instance, that contains helper properties that can be used
   * to configure the Apollo client.
   * @param user A valid logged-in [[User]].
   * @param realmPath The relative path for the Realm on the server. If the path contains `~`,
   * it will be replaced with the user's Id (this will not work if the user was logged in with
   * [[Credentials.anonymous]]).
   * @param authErrorHandler An error handler that will be invoked if there are problems with
   * refreshing the user's access token (which can happen either because they lost access to
   * the Realm or due to network issues). If you return `true`, the error will be considered
   * fatal and the request will not be retried. Otherwise, a retry will be attempted after
   * 3 seconds.
   * @param isQueryBasedSync A boolean, representing whether to connect to a reference Realm
   * using query based sync. In this mode, query subscriptions must be created before any data
   * can be returned.
   * @returns A Promise, that, when resolved, contains a fully configured `GraphQLConfig`
   * instance.
   */
  public static async create(
    user: User,
    realmPath: string,
    authErrorHandler?: (error: any) => boolean,
    isQueryBasedSync?: boolean) {
      realmPath = realmPath.replace('/~/', `/${user.identity}/`);
      if (isQueryBasedSync) {
        realmPath = `${realmPath}/__partial/${user.identity}/graphql-client`;
      }

      const accessToken = await AuthenticationHelper.refreshAccessToken(user, realmPath);
      return new GraphQLConfig(user, realmPath, accessToken, authErrorHandler);
  }

  /**
   * @readonly
   * The http endpoint of the ROS GraphQL API. This is provided for
   * convenience and always resolves to `http://path-to-ros:port/graphql/realmPath`.
   *
   * @example
   * ```
   *
   * const httpLink = createHttpLink({
   *   uri: config.httpEndpoint
   * });
   * ```
   *
   * @see {@link https://www.apollographql.com/docs/link/links/http.html HttpLink docs}.
   */
  public readonly httpEndpoint: string;

  /**
   * @readonly
   * The websocket endpoint of the ROS GraphQL subscription API.
   * This is provided for convenience and always resolves to
   * `ws://path-to-ros:port/graphql/realmPath`.
   *
   * @example
   * ```
   *
   * const subscriptionLink = new WebSocketLink({
   *   uri: config.webSocketEndpoint,
   *   options: {
   *     connectionParams: config.connectionParams
   *   }
   * });
   * ```
   *
   * @see {@link https://www.apollographql.com/docs/link/links/ws.html WebSocket Link docs}.
   */
  public readonly webSocketEndpoint: string;

  /**
   * @readonly
   * A function that generates the connection params that are sent to the ROS
   * GraphQL subscription API. They contain the access token used to authenticate
   * the connection.
   *
   * **Note**: do not invoke the function but instead pass the property directly
   * to the SubscriptionClient's options. This way, the client will be able to
   * invoke it every time a connection is established, thus providing a valid
   * access token every time.
   * @example
   * ```
   *
   * const subscriptionLink = new WebSocketLink({
   *   uri: config.webSocketEndpoint,
   *   options: {
   *     connectionParams: config.connectionParams
   *   }
   * });
   * ```
   *
   * @see {@link https://www.apollographql.com/docs/link/links/ws.html WebSocket Link docs}.
   */
  public readonly connectionParams: () => ConnectionParams;

  /**
   * @readonly
   * An ApolloLink that handles setting the Authorization header on HTTP
   * request (query and mutation operations). Compose this with an `HttpLink`
   * by calling `ApolloLink.concat` or `ApolloLink.from`.
   *
   * @example
   * ```
   *
   * const httpLink = ApolloLink.concat(
   *   config.authLink,
   *   new HttpLink({ uri: config.httpEndpoint }));
   * ```
   *
   * @see {@link https://www.apollographql.com/docs/link/composition.html Composing Links section}
   * in the Apollo Client docs.
   * @see {@link https://www.apollographql.com/docs/link/links/http.html HttpLink docs}.
   */
  public readonly authLink: ApolloLink;

  private readonly user: User;
  private readonly authErrorHandler: (error: any) => boolean;
  private readonly realmPath: string;
  private token: string;

  private constructor(
    user: User,
    realmPath: string,
    accessToken: AccessToken,
    authErrorHandler?: (error: any) => boolean,
  ) {
    this.user = user;
    this.authErrorHandler = authErrorHandler;
    this.realmPath = realmPath;

    this.token = accessToken.token;

    if (accessToken.expires) {
      this.refreshToken(accessToken.expires - Date.now() - 10000);
    }

    const graphQLEndpoint = new URI(user.server).segmentCoded(['graphql', realmPath]);
    this.httpEndpoint = graphQLEndpoint.toString();

    let subscriptionScheme: string;
    switch (graphQLEndpoint.scheme()) {
      case 'http':
        subscriptionScheme = 'ws';
        break;
      case 'https':
        subscriptionScheme = 'wss';
        break;
      default:
        throw new Error(`Unrecognized scheme for the server endpoint: ${graphQLEndpoint.scheme()}`);
    }

    this.webSocketEndpoint = graphQLEndpoint.clone().scheme(subscriptionScheme).toString();
    this.connectionParams = () => {
      if (this.token) {
        return {
          token: this.token,
        };
      }

      return {};
    };

    this.authLink = setContext((_, { headers }) => {
      if (this.token) {
        return {
          headers: {
            ...headers,
            authorization: this.token,
          },
        };
      }
    });
  }

  /**
   * Creates an Apollo client with InMemoryCache. The client will be configured with
   * an http link for query and mutation operations and a websocket link for subscriptions.
   */
  public createApolloClient(): ApolloClient<NormalizedCacheObject> {
    return this.createApolloClientWithCache(new InMemoryCache());
  }

  /**
   * Creates an Apollo client with the specified cache. The client will be configured with
   * an http link for query and mutation operations and a websocket link for subscriptions.
   * @param cache The cache that the Apollo client will use.
   */
  public createApolloClientWithCache<TCacheShape>(cache: ApolloCache<TCacheShape>): ApolloClient<TCacheShape> {
    const httpLink = createHttpLink({
      uri: this.httpEndpoint,
      fetch,
    });

    const subscriptionLink = new WebSocketLink({
      uri: this.webSocketEndpoint,
      options: {
        connectionParams: this.connectionParams,
        reconnect: true,
        lazy: true,
      },
      webSocketImpl: ws,
    });

    const retryLink = new RetryLink({
      delay: {
        initial: 100,
        max: 5000,
      },
      attempts: {
        max: 3,
        retryIf: async (error) => {
          if (error && error.result && error.result.status === 401) {
            await this.refreshToken(0, /* shouldRetry */ false);
          }

          return true;
        },
      },
    });

    const link = split(({ query }) => {
        const { kind, operation } = getMainDefinition(query);
        return kind === 'OperationDefinition' && operation === 'subscription';
      },
      subscriptionLink,
      from([retryLink, this.authLink, httpLink]));

    return new ApolloClient({
      link,
      cache,
    });
  }

  /**
   * Forces a refresh of the user's access token. Tokens are refreshed automatically
   * 10 seconds before they expire. Since that relies on a javascript timer, it's
   * possible that the token isn't proactively refreshed, for example, because the
   * app was suspended for some time.
   * @param afterDelay Delay to wait before refreshing the token.
   * @param shouldRetry A boolean parameter that controls whether to retry the request on error.
   */
  public async refreshToken(afterDelay: number, shouldRetry = true): Promise<boolean> {
    await this.delay(afterDelay);

    if (!this.user.token) {
      // User logged out, stop refreshing
      return false;
    }

    try {
      const result = await AuthenticationHelper.refreshAccessToken(this.user, this.realmPath);
      this.token = result.token;

      this.refreshToken(result.expires - Date.now() - 10000);
      return true;
    } catch (e) {
      if (this.authErrorHandler) {
        // Always report the error, even if we're not retrying
        shouldRetry = !this.authErrorHandler(e) && shouldRetry;
      }

      if (shouldRetry) {
        return this.refreshToken(3000);
      }
    }

    return false;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }
}
