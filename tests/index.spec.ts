import { expect } from 'chai'
import { TestServer } from 'realm-object-server'
import { generateFakeDataRealm } from './generate-fake-data'
import * as Realm from 'realm'

describe('integration test', function () {

    let testServer: TestServer
    let user: Realm.Sync.User
    let testRealm: Realm

    before(async () => {
        testServer = new TestServer()
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