// tslint:disable:no-unused-expression
// tslint:disable:max-line-length
import * as chai from 'chai';
const { expect } = chai;

// Load chai plugins
import chaiArrays = require('chai-arrays');
chai.use(chaiArrays);
import chaiExclude = require('chai-exclude');
chai.use(chaiExclude);
import chaiString = require('chai-string');
chai.use(chaiString);

import { InMemoryCache, NormalizedCacheObject } from 'apollo-cache-inmemory';
import { ApolloClient } from 'apollo-client';
import { from, split } from 'apollo-link';
import { onError } from 'apollo-link-error';
import { createHttpLink } from 'apollo-link-http';
import { WebSocketLink } from 'apollo-link-ws';
import { getMainDefinition } from 'apollo-utilities';
import gql from 'graphql-tag';
import * as fetch from 'node-fetch';
import * as Realm from 'realm';
import { setTimeout } from 'timers';
import { v4 } from 'uuid';
import * as ws from 'ws';

import { Credentials, GraphQLConfig, User } from '../src/index';
import { Company, generateFakeDataRealm } from './generate-fake-data';
import { GraphQLTestServer } from './GraphQLTestServer';

describe('RealmGraphQL', () => {
  const userId = v4();

  let testServer: GraphQLTestServer;
  let graphQLUser: User;
  let serverUrl: string;
  let firstCompanyNameLetter: string;
  let lastCompanyNameLetter: string;
  let helper: GraphQLConfig;
  let testRealm: Realm;

  const ensureSynced = async (direction?: 'download' | 'upload') => {
    await new Promise((resolve) => setTimeout(resolve, 100));
    await new Promise((resolve) => {
      testRealm.syncSession.addProgressNotification(
        direction || 'download',
        'forCurrentlyOutstandingWork',
        (downloaded, downloadable) => {
          if (downloaded >= downloadable) {
            resolve();
          }
        },
      );
    });
  };

  before(async () => {
    testServer = new GraphQLTestServer();
    await testServer.start();

    serverUrl = `http://${testServer.address}`;

    const credentials = Credentials.nickname(userId);
    graphQLUser = await User.authenticate(credentials, serverUrl);
  });

  after(async () => {
    await testServer.shutdown();
  });

  describe('full sync', () => {
    const getCompanyCount = () => {
      return testRealm.objects('Company').length;
    };

    before(async () => {
      const realmCredentials = Realm.Sync.Credentials.nickname(userId);
      const realmUser = await Realm.Sync.User.login(serverUrl, realmCredentials);

      testRealm = await generateFakeDataRealm(
        true,
        `realm://${testServer.address}/${realmUser.identity}/test`,
        realmUser,
      );
      await ensureSynced('upload');
      firstCompanyNameLetter = testRealm.objects<Company>('Company').sorted('name')[0].name.toUpperCase()[0];
      lastCompanyNameLetter = testRealm.objects<Company>('Company').sorted('name', true)[0].name.toUpperCase()[0];

      // Setup the apollo client
      helper = await GraphQLConfig.create(
        graphQLUser,
        `/${realmUser.identity}/test`
      );
    });

    it('should have some fake data', () => {
      const numberOfCompanies = testRealm.objects('Company').length;
      expect(numberOfCompanies).to.equal(200);
    });

    it('should specify valid graphql url', () => {
      expect(helper.httpEndpoint).to.equal(`http://${testServer.address}/graphql/%2F${graphQLUser.identity}%2Ftest`);
    });

    it('should specify valid websocket url', () => {
      expect(helper.webSocketEndpoint).to.equal(`ws://${testServer.address}/graphql/%2F${graphQLUser.identity}%2Ftest`);
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

    describe('create a client', () => {
      let client: ApolloClient<NormalizedCacheObject>;

      before(async () => {
        const httpLink = createHttpLink({
          uri: helper.httpEndpoint,
          fetch
        });

        const subscriptionLink = new WebSocketLink({
          uri: helper.webSocketEndpoint,
          options: {
            connectionParams: helper.connectionParams,
            reconnect: true,
            lazy: true
          },
          webSocketImpl: ws
        });

        const link = split(({ query }) => {
            const { kind, operation } = getMainDefinition(query);
            return kind === 'OperationDefinition' && operation === 'subscription';
          },
          subscriptionLink,
          from([onError((error) => {
            // Helpful for debugging purposes
          }), helper.authLink, httpLink]));

        client = new ApolloClient({
          link,
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
            fetchPolicy: 'network-only'
          });

          expect(result.data.companies.length).to.be.above(0);

          return result.data.companies;
        };

        it('should return the entire dataset', async () => {
          const companies = await queryFunc();

          expect(companies.length).to.equal(getCompanyCount());

          expect(companies).to.satisfy((value: Company[]) => {
            return value.every((c) => {
              return !!(c.name && c.address && c.companyId);
            });
          });
        });

        it('should return filtered results', async () => {
          const companies = await queryFunc(`(query: "name BEGINSWITH[c] '${firstCompanyNameLetter}'")`);

          for (const company of companies) {
            expect(company.name.toUpperCase()).to.startWith(firstCompanyNameLetter);
          }
        });

        it('should return sorted results', async () => {
          const companies = await queryFunc(`(sortBy: "name")`);

          const expected = companies.slice(0).sort(
            (prev, next) => prev.name.toUpperCase().localeCompare(next.name.toUpperCase())
          );

          for (let i = 0; i < companies.length; i++) {
            expect(companies[i].name).to.equal(expected[i].name);
          }

          expect(companies[0].name.toUpperCase()).to.startWith(firstCompanyNameLetter);
        });

        it('should return results sorted descending', async () => {
          const companies = await queryFunc(`(sortBy: "name", descending: true)`);

          const expected = companies.slice(0).sort(
            (prev, next) => next.name.toUpperCase().localeCompare(prev.name.toUpperCase())
          );

          for (let i = 0; i < companies.length; i++) {
            expect(companies[i].name).to.equal(expected[i].name);
          }

          expect(companies[0].name.toUpperCase()).to.startWith(lastCompanyNameLetter);
        });

        it('should skip records', async () => {
          const companies = await queryFunc(`(sortBy: "name", skip: 100)`);

          // This is a bit optimistic, but expect that the random distribution
          // won't be skewed toward either end.
          expect(companies.length).to.equal(getCompanyCount() - 100);
          expect(companies).to.satisfy((value: Company[]) => {
            return value.every((c) => {
              return !c.name.toUpperCase().startsWith(firstCompanyNameLetter);
            });
          });
        });

        it('should limit the returned results', async () => {
          const companies = await queryFunc(`(sortBy: "name", take: 100)`);

          expect(companies.length).to.equal(100);
          expect(companies[0].name.toUpperCase()).to.startWith(firstCompanyNameLetter);
        });

        it('should paginate the result', async () => {
          const companies = await queryFunc(`(sortBy: "name", skip: 90, take: 20)`);

          expect(companies.length).to.equal(20);
          expect(companies[0].name.toUpperCase()).to.not.startWith(firstCompanyNameLetter);
          expect(companies[19].name.toUpperCase()).to.not.startWith(lastCompanyNameLetter);
        });
      });

      describe('and execute mutation', () => {
        const mutationFunc = async (mutationAction: 'add' | 'update', payload: Company): Promise<Company> => {
          const result = await client.mutate<{result: Company}>({
            mutation: gql`
              mutation {
                result: ${mutationAction}Company(input: {
                  ${payload.companyId ? `companyId: "${payload.companyId}"` : ''}
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

        const deleteFunc = async (id: string): Promise<boolean> => {
          const result = await client.mutate<{result: boolean}>({
            mutation: gql`
              mutation {
                result: deleteCompany(companyId: "${id}")
              }
            `
          });

          return result.data.result;
        };

        describe('when adding object', () => {
          it('should add the object', async () => {
            const companyId = v4();
            const result = await mutationFunc('add', {
              companyId,
              name: 'ACME Inc.',
              address: '1 Infinite Loop'
            });

            expect(result.companyId).to.equal(companyId);
            expect(result.name).to.equal('ACME Inc.');
            expect(result.address).to.equal('1 Infinite Loop');

            // wait for sync as realm-js doesn't have WaitForDownload yet :/
            await ensureSynced();

            const companyInRealm = testRealm.objectForPrimaryKey<Company>('Company', companyId);
            expect(companyInRealm).to.be.ok;
            expect(companyInRealm.name).to.equal('ACME Inc.');
            expect(companyInRealm.address).to.equal('1 Infinite Loop');
          });

          it('should fail when properties are missing', async () => {
            try {
              await mutationFunc('add', {
                companyId: v4(),
                name: 'ACME Inc.',
                address: undefined
              });

              expect.fail(undefined, undefined, 'Expected add to fail.');
            } catch (e) {
              expect(e.message).to.contain('Company.address');
            }
          });

          it('should fail when PK is duplicate', async () => {
            const companyId = v4();

            try {
              await mutationFunc('add', {
                companyId,
                name: 'foo',
                address: 'bar'
              });

              await mutationFunc('add', {
                companyId,
                name: 'foo2',
                address: 'bar2'
              });

              expect.fail(undefined, undefined, 'Expected add to fail with duplicate PK.');
            } catch (e) {
              expect(e.message).to.contain(companyId).and.to.contain('existing primary key');
            }
          });
        });

        describe('when updating object', () => {
          it('should update the object', async () => {
            const companyId = v4();

            // Add the company that we'll update
            await mutationFunc('add', {
              companyId,
              name: 'should be replaced',
              address: 'should be replaced'
            });

            const result = await mutationFunc('update', {
              companyId,
              name: 'Updated Inc.',
              address: '111 Infinite Loop'
            });

            expect(result.companyId).to.equal(companyId);
            expect(result.name).to.equal('Updated Inc.');
            expect(result.address).to.equal('111 Infinite Loop');

            await ensureSynced();

            const companyInRealm = testRealm.objectForPrimaryKey<Company>('Company', companyId);
            expect(companyInRealm).to.be.ok;
            expect(companyInRealm.name).to.equal('Updated Inc.');
            expect(companyInRealm.address).to.equal('111 Infinite Loop');
          });

          it('should partially update the object', async () => {
            const companyId = v4();

            // Add the company that we'll update
            await mutationFunc('add', {
              companyId,
              name: 'should be replaced',
              address: 'should remain unchanged'
            });
            const result = await mutationFunc('update', {
              companyId,
              name: 'Partial Update Inc.',
              address: undefined
            });

            expect(result.companyId).to.equal(companyId);
            expect(result.name).to.equal('Partial Update Inc.');

            // Address should be unchanged
            expect(result.address).to.equal('should remain unchanged');

            await ensureSynced();

            const companyInRealm = testRealm.objectForPrimaryKey<Company>('Company', companyId);
            expect(companyInRealm).to.be.ok;
            expect(companyInRealm.name).to.equal('Partial Update Inc.');
            expect(companyInRealm.address).to.equal('should remain unchanged');
          });
        });

        describe('when deleting object', () => {
          it('should return true when successful', async () => {
            const companyId = v4();

            // Add the company that we'll update
            await mutationFunc('add', {
              companyId,
              name: 'should be replaced',
              address: 'should be replaced'
            });

            const result = await deleteFunc(companyId);

            expect(result).to.be.true;

            await ensureSynced();
            const companyInRealm = testRealm.objectForPrimaryKey<Company>('Company', companyId);
            expect(companyInRealm).to.be.undefined;
          });

          it('should return false when object doesn\'t exist', async () => {
            const preDeleteCount = testRealm.objects('Company').length;

            const result = await deleteFunc(v4());

            expect(result).to.be.false;

            await ensureSynced();

            const postDeleteCount = testRealm.objects('Company').length;

            expect(postDeleteCount).to.equal(preDeleteCount);
          });

          it('should delete objects with a query', async () => {
            for (let i = 0; i < 10; i++) {
              await mutationFunc('add', {
                companyId: v4(),
                name: `deleteMe${i}`,
                address: 'irrelevant'
              });
            }

            await ensureSynced();

            const toBeDeleted = testRealm.objects('Company').filtered('name BEGINSWITH \'deleteMe\'');
            expect(toBeDeleted.length).to.equal(10);

            const response = await client.mutate<{result: number}>({
              mutation: gql`
                mutation {
                  result: deleteCompanies(query: "name BEGINSWITH 'deleteMe'")
                }
              `
            });

            expect(response.data.result).to.equal(10);

            await ensureSynced();

            expect(toBeDeleted.length).to.equal(0);
          });
        });

        describe('when combining mutations', () => {
          it('should execute sequential add operations', async () => {
            const companyA: Company = {
              companyId: v4(),
              address: 'Some address',
              name: 'Sequential Company A'
            };

            const companyB: Company = {
              companyId: v4(),
              address: 'A different address',
              name: 'Sequential Company B'
            };

            const result = await client.mutate({
              mutation: gql`
                mutation {
                  addedCompanyA: addCompany(input: {
                    companyId: "${companyA.companyId}"
                    name: "${companyA.name}"
                    address: "${companyA.address}"
                  }) {
                    companyId
                    name
                    address
                  }
                  addedCompanyB: addCompany(input: {
                    companyId: "${companyB.companyId}"
                    name: "${companyB.name}"
                    address: "${companyB.address}"
                  }) {
                    companyId
                    name
                    address
                  }
                }
              `
            });

            expect(result.data.addedCompanyA).excluding('__typename').to.deep.equal(companyA);
            expect(result.data.addedCompanyB).excluding('__typename').to.deep.equal(companyB);

            await ensureSynced();

            const realmCompanyA = testRealm.objectForPrimaryKey('Company', companyA.companyId);
            const realmCompanyB = testRealm.objectForPrimaryKey('Company', companyB.companyId);

            for (const prop in companyA) {
              if (companyA.hasOwnProperty(prop)) {
                expect(realmCompanyA[prop]).to.equal(companyA[prop]);
                expect(realmCompanyB[prop]).to.equal(companyB[prop]);
              }
            }
          });
        });
      });

      describe('and execute subscription', () => {
        const subscriptionFunc = async (additionalParameters?: string) => {
          const subscriptionData = {
            companies: new Array<Company>(),
            updates: 0,
            updateCompanies: (value: Company[], error: any) => {
              subscriptionData.updates++;
              if (error) {
                subscriptionData.error = error;
              } else {
                subscriptionData.companies.length = 0;
                subscriptionData.companies.push(...value);
              }
            },
            error: null,
            observable: await client.subscribe({
              query: gql`
                subscription {
                  companies${additionalParameters || ''} {
                    companyId
                    name
                    address
                  }
                }
              `
            })
          };

          subscriptionData.observable.subscribe({
            next(data) {
              subscriptionData.updateCompanies(data.data.companies, null);
            },
            error(value) {
              subscriptionData.updateCompanies(null, value);
            }
          });

          await waitForSubscription(subscriptionData);

          return subscriptionData;
        };

        const waitForSubscription = async (value: {updates: number, error: any}) => {
          const initial = value.updates;
          let counter = 20;
          while (value.updates === initial && counter > 0) {
            await new Promise((resolve) => setTimeout(resolve, 100));
            counter--;
          }

          expect(value.error).to.be.null;
        };

        describe('when subscribed to entire dataset', async () => {
          it('should update when item is added', async () => {
            const subscriptionData = await subscriptionFunc();

            expect(subscriptionData.companies.length).to.equal(getCompanyCount());

            expect(subscriptionData.companies).to.satisfy((value: Company[]) => {
              return value.every((c) => {
                return !!(c.name && c.address && c.companyId);
              });
            });

            const companyId = v4();

            testRealm.write(() => {
              testRealm.create<Company>('Company', {
                companyId,
                address: 'Some address',
                name: 'Subscription company'
              });
            });

            // Not synced yet
            expect(subscriptionData.companies.length).to.not.equal(getCompanyCount());
            await ensureSynced('upload');
            await waitForSubscription(subscriptionData);

            expect(subscriptionData.companies.length).to.equal(getCompanyCount());
            expect(subscriptionData.companies).to.satisfy(
              (value: Company[]) =>  value.some((c) => c.companyId === companyId)
            );
          });

          it('should update when item is deleted', async () => {
            const subscriptionData = await subscriptionFunc();

            const toDeleteId = subscriptionData.companies[0].companyId;

            testRealm.write(() => {
              const toDelete = testRealm.objectForPrimaryKey('Company', toDeleteId);
              testRealm.delete(toDelete);
            });

            // Not synced yet
            expect(subscriptionData.companies.length).to.not.equal(getCompanyCount());
            await ensureSynced('upload');
            await waitForSubscription(subscriptionData);

            expect(subscriptionData.companies.length).to.equal(getCompanyCount());
            expect(subscriptionData.companies).to.satisfy(
              (value: Company[]) =>  value.every((c) => c.companyId !== toDeleteId)
            );
          });

          it('should update when item is updated', async () => {
            const subscriptionData = await subscriptionFunc();

            const toUpdateId = subscriptionData.companies[0].companyId;

            testRealm.write(() => {
              const toUpdate = testRealm.objectForPrimaryKey<Company>('Company', toUpdateId);
              toUpdate.address = 'This was updated!';
            });

            await ensureSynced('upload');
            await waitForSubscription(subscriptionData);

            expect(subscriptionData.companies.length).to.equal(getCompanyCount());

            const updated = subscriptionData.companies.find((c) => c.companyId === toUpdateId);
            expect(updated.address).to.equal('This was updated!');
          });
        });
      });
    });
  });

  describe('partial sync', () => {
    before(async () => {
      const adminUser = await Realm.Sync.User.login(serverUrl, Realm.Sync.Credentials.nickname('admin', true));

      // Create realm as reference realm before populating it
      const realm = await Realm.open({
        sync: {
          url: `realm://${testServer.address}/test`,
          user: adminUser,
          fullSynchronization: false
        }
      });
      realm.close();

      testRealm = await generateFakeDataRealm(
        true,
        `realm://${testServer.address}/test`,
        adminUser,
      );
      await ensureSynced('upload');
      firstCompanyNameLetter = testRealm.objects<Company>('Company').sorted('name')[0].name.toUpperCase()[0];
      lastCompanyNameLetter = testRealm.objects<Company>('Company').sorted('name', true)[0].name.toUpperCase()[0];

      // Setup the apollo client
      helper = await GraphQLConfig.create(
        graphQLUser,
        `/test`,
        /* authErrorHandler */ undefined,
        /* isQueryBasedSync */ true,
      );
    });

    it('should specify valid graphql url', () => {
      expect(helper.httpEndpoint).to.equal(`http://${testServer.address}/graphql/%2Ftest%2F__partial%2F${graphQLUser.identity}%2Fgraphql-client`);
    });

    it('should specify valid websocket url', () => {
      expect(helper.webSocketEndpoint).to.equal(`ws://${testServer.address}/graphql/%2Ftest%2F__partial%2F${graphQLUser.identity}%2Fgraphql-client`);
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
  });
});
