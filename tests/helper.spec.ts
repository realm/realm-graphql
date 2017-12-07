import { expect } from 'chai';

import * as chai from 'chai';
import chaiExclude = require('chai-exclude');

chai.use(require('chai-string'));
chai.use(require('chai-arrays'));
chai.use(chaiExclude);

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
import { testServer } from './common';
import { v4 } from 'uuid';
import { GraphQLError } from 'graphql/error/GraphQLError';

describe('RealmHelper', function() {
  const companyCount = 200;

  const userId = v4();

  let realmUser: Realm.Sync.User;
  let testRealm: Realm;
  let firstCompanyNameLetter: string;
  let lastCompanyNameLetter: string;

  let helper: RealmHelper;

  const ensureSynced = async () => {
    await new Promise(resolve => setTimeout(resolve, 10));
    await new Promise(resolve => testRealm.syncSession.addProgressNotification('download', 'forCurrentlyOutstandingWork', (downloaded, downloadable) => {
      if (downloaded >= downloadable) {
        resolve();
      }
    }));
  };

  before(async () => {
    realmUser = await Realm.Sync.User.register(`http://${testServer.address}`, userId, 'a');
    testRealm = await generateFakeDataRealm(true, `realm://${testServer.address}/${realmUser.identity}/test`, realmUser);
    firstCompanyNameLetter = testRealm.objects<Company>('Company').sorted('name')[0].name.toUpperCase()[0];
    lastCompanyNameLetter = testRealm.objects<Company>('Company').sorted('name', true)[0].name.toUpperCase()[0];

    // Setup the apollo client
    const credentials = Credentials.UsernamePassword(userId, 'a');
    const user = await User.authenticate(`http://${testServer.address}`, credentials);
    helper = await RealmHelper.create({ 
      user,
      realmPath: `/${realmUser.identity}/test`
    });
  });  

  it('should have some fake data', () => {
    const numberOfCompanies = testRealm.objects('Company').length;
    expect(numberOfCompanies).to.equal(companyCount);
  });

  it('should specify valid graphql url', () => {
    expect(helper.httpEndpoint).to.equal(`http://${testServer.address}/graphql/%2F${realmUser.identity}%2Ftest`);
  });

  it('should specify valid websocket url', () => {
    expect(helper.webSocketEndpoint).to.equal(`ws://${testServer.address}/graphql/%2F${realmUser.identity}%2Ftest`);
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
          // Helpful for debugging purposes
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

      it('should return the entire dataset', async () => {
        const companies = await queryFunc();
    
        expect(companies.length).to.equal(companyCount);

        expect(companies).to.satisfy((value: Company[]) => {
          return value.every(c => {
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

        let expected = companies.slice(0).sort((prev, next) => prev.name.toUpperCase().localeCompare(next.name.toUpperCase()));

        for (let i = 0; i < companies.length; i++) {
          expect(companies[i].name).to.equal(expected[i].name);
        }

        expect(companies[0].name.toUpperCase()).to.startWith(firstCompanyNameLetter);
      });

      it('should return results sorted descending', async () => {
        const companies = await queryFunc(`(sortBy: "name", descending: true)`);
        
        let expected = companies.slice(0).sort((prev, next) => next.name.toUpperCase().localeCompare(prev.name.toUpperCase()));
        
        for (let i = 0; i < companies.length; i++) {
          expect(companies[i].name).to.equal(expected[i].name);
        }

        expect(companies[0].name.toUpperCase()).to.startWith(lastCompanyNameLetter);
      });

      it('should skip records', async () => {
        const companies = await queryFunc(`(sortBy: "name", skip: 100)`);

        // This is a bit optimistic, but expect that the random distribution
        // won't be skewed toward either end.
        expect(companies.length).to.equal(companyCount - 100);
        expect(companies).to.satisfy((value: Company[]) => {
          return value.every(c => {
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
          }
          catch (e) {
            expect(e.message).to.contain('Company.address');
          }
        });

        it('should fail when PK is duplicate', async () => {
          const companyId = v4();

          try {
            await mutationFunc('add', {
              companyId: companyId,
              name: 'foo',
              address: 'bar'
            });

            await mutationFunc('add', {
              companyId: companyId,
              name: 'foo2',
              address: 'bar2'
            });

            expect.fail(undefined, undefined, 'Expected add to fail with duplicate PK.');
          }
          catch (e) {
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

          const toBeDeleted = testRealm.objects('Company').filtered("name BEGINSWITH 'deleteMe'");
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
            expect(realmCompanyA[prop]).to.equal(companyA[prop]);
            expect(realmCompanyB[prop]).to.equal(companyB[prop]);
          }
        });
      });
    });
  });
});
