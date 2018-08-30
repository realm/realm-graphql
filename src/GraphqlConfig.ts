import { ApolloLink } from 'apollo-link';
import { setContext } from 'apollo-link-context';
import * as URI from 'urijs';

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
   * @returns A Promise, that, when resolved, contains a fully configured `GraphQLConfig`
   * instance.
   */
  public static async create(
    user: User,
    realmPath: string,
    authErrorHandler?: (error: any) => boolean) {
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
  public readonly connectionParams: () => any;

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

  private constructor(
    user: User,
    realmPath: string,
    accessToken: AccessToken,
    authErrorHandler?: (error: any) => boolean
  ) {
    let token = accessToken.token;
    realmPath = realmPath.replace('/~/', `/${user.identity}/`);

    const refresh = (afterDelay: number) => {
      setTimeout(async () => {
        if (!user.token) {
          // User logged out, stop refreshing
          return;
        }

        try {
          const result = await AuthenticationHelper.refreshAccessToken(user, realmPath);
          token = result.token;

          refresh(result.expires - Date.now() - 10000);
        } catch (e) {
          if (!authErrorHandler || !authErrorHandler(e)) {
            refresh(3000);
          }
        }
      }, afterDelay);
    };

    if (accessToken.expires) {
      refresh(accessToken.expires - Date.now() - 10000);
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
      if (token) {
        return {
          token
        };
      }

      return {};
    };

    this.authLink = setContext((_, { headers }) => {
      if (token) {
        return {
          headers: {
            ...headers,
            authorization: token
          }
        };
      }
    });
  }
}
