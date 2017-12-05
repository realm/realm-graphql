import { expect } from 'chai'
import { generateFakeDataRealm } from './generate-fake-data'
import { GraphQLTestServer } from './GraphQLTestServer'
import * as Realm from 'realm'

describe('integration test', function () {

    let testServer: GraphQLTestServer
    let user: Realm.Sync.User
    let testRealm: Realm

    before(async () => {
        testServer = new GraphQLTestServer()
        await testServer.start()
        user = Realm.Sync.User.adminUser(testServer.adminToken, `http://${testServer.address}`)
        testRealm = await generateFakeDataRealm(true, `realm://${testServer.address}/test`, user)
    })

    after(async () => {
        await testServer.shutdown()
    })

    it('should have some fake data', () => {
        const numberOfCompanies = testRealm.objects('Company').length
        expect(numberOfCompanies).to.be.above(0)
    })
})