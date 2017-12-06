import { expect } from 'chai';

import * as chai from 'chai';
chai.use(require('chai-string'));
chai.use(require('chai-arrays'))

import * as Realm from 'realm';
import { generateFakeDataRealm, Company } from './generate-fake-data';
import { GraphQLTestServer } from './GraphQLTestServer';
import { Credentials, User, RealmHelper } from '../src/index';
import gql from 'graphql-tag';
import { onError } from "apollo-link-error";
import * as ws from 'ws';
import { setTimeout } from 'timers';
import { createHttpLink } from 'apollo-link-http';
import * as fetch from 'node-fetch'
import { SubscriptionClient } from 'subscriptions-transport-ws';
import { WebSocketLink } from 'apollo-link-ws';
import { split } from 'apollo-link';
import { getMainDefinition } from 'apollo-utilities';
import { ApolloClient } from 'apollo-client';
import { NormalizedCacheObject, InMemoryCache } from 'apollo-cache-inmemory';
import { from } from 'apollo-link';

describe('RealmHelper', function() {
  const companyCount = 200;

  let testServer: GraphQLTestServer;
  let realmUser: Realm.Sync.User;
  let testRealm: Realm;

  let helper: RealmHelper;

  before(async () => {
    testServer = new GraphQLTestServer();
    await testServer.start();
    realmUser = await Realm.Sync.User.register(`http://${testServer.address}`, 'a@a', 'a');
    testRealm = await generateFakeDataRealm(true, `realm://${testServer.address}/${realmUser.identity}/test`, realmUser);

    // Setup the apollo client
    const credentials = Credentials.UsernamePassword('a@a', 'a');
    const user = await User.authenticate(`http://${testServer.address}`, credentials);
    helper = await RealmHelper.create({ 
      user,
      realmPath: `/${realmUser.identity}/test`
    });
  });  

  after(async () => {
    await testServer.shutdown();
  });

  it('should have some fake data', () => {
    const numberOfCompanies = testRealm.objects('Company').length;
    expect(numberOfCompanies).to.be.equal(companyCount);
  });

  it('should specify valid graphql url', () => {
    expect(helper.httpEndpoint).to.equal(`http://${testServer.address}/graphql/%2F${realmUser.identity}%2Ftest`);
  });

  it('should specify valid websocket url', () => {
    expect(helper.webSocketEndpoint).to.be.equal(`ws://${testServer.address}/graphql/%2F${realmUser.identity}%2Ftest`);
  });

  it('should have valid authLink', () => {
    expect(helper.authLink).to.be.an('object');
    expect(helper.authLink).to.exist;
  });

  it('should have valid connectionParams', () => {
    expect(helper.connectionParams).to.be.a('function');
    expect(helper.connectionParams).to.exist;
    expect(helper.connectionParams()).to.be.not.empty;
  });

  describe('create a client', function() {
    let client: ApolloClient<NormalizedCacheObject>;

    before(async () => {
      const httpLink = createHttpLink({
        uri: helper.httpEndpoint,
        fetch: fetch
      });
  
      const subscriptionClient = new SubscriptionClient(helper.webSocketEndpoint, {
        connectionParams: helper.connectionParams,
        reconnect: true,
        lazy: true
      }, ws);
  
      const subscriptionLink = new WebSocketLink(subscriptionClient);
      const link = split(({ query }) => {
          const { kind, operation } = getMainDefinition(query);
          return kind === 'OperationDefinition' && operation === 'subscription';
        },
        subscriptionLink,
        from([onError(error => {
          console.log(error);
        }), helper.authLink, httpLink]));
  
      client = new ApolloClient({
        link: link,
        cache: new InMemoryCache()
      });
    });

    describe('and execute query', () => {
      const queryFunc = async (additionalParameters?: string): Promise<Company[]> => {
        const result = await client.query<{companies: Company[]}>({
          query: gql`
            query {
              companies${additionalParameters || ''} {
                companyId
                name
                address
              }
            }
          `,
          fetchPolicy: "network-only"
        });

        expect(result.data.companies.length).to.be.above(0);
        
        return result.data.companies;
      };

      describe('when no filter specified', () => {
        it('should return the collection', async () => {
          const companies = await queryFunc();
      
          expect(companies.length).to.be.equal(companyCount);

          expect(companies).to.satisfy((value: Company[]) => {
            return value.every(c => {
              return !!(c.name && c.address && c.companyId);
            });
          });
        });
      });

      describe('when NSPredicate query provided', () => {
        it('should return filtered results', async () => {
          const companies = await queryFunc(`(query: "name BEGINSWITH[c] 'a'")`);
          
          for (const company of companies) {
            expect(company.name.toUpperCase()).to.startWith('A');
          }
        });
      });

      describe('when sortBy specified', () => {
        it('should return sorted results', async () => {
          const companies = await queryFunc(`(sortBy: "name")`);
  
          (expect(companies) as any).to.be.sorted((prev: Company, next: Company) => {
            return prev.name.toUpperCase().localeCompare(next.name.toUpperCase());
          });

          expect(companies[0].name.toUpperCase()).to.startWith('A');
        });
      });

      describe('when sortBy desc specified', () => {
        it('should return results sorted descending', async () => {
          const companies = await queryFunc(`(sortBy: "name", descending: true)`);
          
          (expect(companies) as any).to.be.sorted((prev: Company, next: Company) => {
            return next.name.toUpperCase().localeCompare(prev.name.toUpperCase());
          });

          expect(companies[0].name.toUpperCase()).to.startWith('Z');
        });
      });

      describe('when skip specified', () => {
        it('should skip records', async () => {
          const companies = await queryFunc(`(sortBy: "name", skip: 100)`);

          // This is a bit optimistic, but expect that the random distribution
          // won't be skewed toward either end.
          expect(companies.length).to.be.equal(companyCount - 100);
          expect(companies).to.satisfy((value: Company[]) => {
            return value.every(c => {
              return !c.name.toUpperCase().startsWith('A');
            });
          });
        });
      });

      describe('when take specified', () => {
        it('should return the expected amount', async () => {
          const companies = await queryFunc(`(sortBy: "name", take: 100)`);

          expect(companies.length).to.be.equal(100);
          expect(companies[0].name.toUpperCase()).to.startWith('A');
        });
      });

      describe('when skip and take specified', () => {
        it('should paginate the result', async () => {
          const companies = await queryFunc(`(sortBy: "name", skip: 90, take: 20)`);
          
          expect(companies.length).to.be.equal(20);
          expect(companies[0].name.toUpperCase()).to.not.startWith('A');
          expect(companies[19].name.toUpperCase()).to.not.startWith('Z');
        });
      });
    });

    describe('and execute mutation', () => {
      const mutationFunc = async (mutationAction: 'add' | 'update', payload: Company): Promise<Company> => {
        const result = await client.mutate<{result: Company}>({
          mutation: gql`
            mutation {
              result: ${mutationAction}Company(input: {
                ${mutationAction == 'add' && payload.companyId ? `companyId: "${payload.companyId}"` : ''}
                ${payload.name ? `name: "${payload.name}"` : ''}
                ${payload.address ? `address: "${payload.address}"` : ''}
              }) {
                companyId
                name
                address
              }
            }
          `
        });

        expect(result.data.result).to.be.ok;
        
        return result.data.result;
      };

      describe('when adding object', () => {
        it('should add the object', async () => {
          const companyId = 'should-add-the-object';
          const result = await mutationFunc('add', {
            companyId,
            name: 'ACME Inc.',
            address: '1 Infinite Loop'
          });

          expect(result.companyId).to.be.equal(companyId);

          // wait for sync as realm-js doesn't have WaitForDownload yet :/
          await new Promise(resolve => setTimeout(resolve, 100));

          const companyInRealm = testRealm.objectForPrimaryKey<Company>('Company', companyId);
          expect(companyInRealm).to.be.ok;
          expect(companyInRealm.name).to.be.equal('ACME Inc.');
          expect(companyInRealm.address).to.be.equal('1 Infinite Loop');
        }).timeout(30000);
      });
    });
  });
});
