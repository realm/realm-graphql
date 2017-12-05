import * as Realm from 'realm';
import * as faker from 'faker'
import * as _ from 'lodash'
// Product

export const ProductSchema: Realm.ObjectSchema = {
    name: 'Product',
    properties: {
        productId: 'string',
        name: 'string',
        price: 'float',
        company: { type: 'Company' }
    }
}

export type Product = {
    productId: string
    name: string
    price: number,
    company: Company
}

// Company

export const CompanySchema: Realm.ObjectSchema = {
    name: 'Company',
    primaryKey: 'companyId',
    properties: {
        companyId: 'string',
        name: 'string',
        address: 'string'
    }
}

export type Company = {
    companyId: string
    name: string
    address: string
}

// Order

export const OrderSchema: Realm.ObjectSchema = {
    name: 'Order',
    primaryKey: 'orderId',
    properties: {
        orderId: 'string',
        timestamp: 'date',
        products: { type: 'list', objectType: 'Product' },
        user: { type: 'User' }
    }
}

export type Order = {
    orderId: string
    timestamp: Date
    products: Realm.List<Product> | Product[],
    user: User
}

// User

export const UserSchema: Realm.ObjectSchema = {
    name: 'User',
    primaryKey: 'userId',
    properties: {
        userId: 'string',
        firstName: 'string',
        lastName: 'string',
        address: { type: 'string', optional: true }
    }
}

export type User = {
    userId: string
    firstName: string
    lastName: string
    address?: string
}

export async function generateFakeDataRealm(generateOnlyIfEmpty: boolean, realmUrl: string, user: Realm.Sync.User) {
    const realm = await Realm.open({
        sync: {
            url: realmUrl,
            user: user
        },
        schema: [ProductSchema, CompanySchema, OrderSchema, UserSchema] 
    })
    if (!realm.empty && generateOnlyIfEmpty) {
        return realm
    }
    realm.write(() => {
        realm.deleteAll()
    })
    let companies: Company[] = []
    realm.write(() => {
        for (let index = 0; index < 200; index++) {
            let c = realm.create<Company>(CompanySchema.name, {
                companyId: faker.random.uuid(),
                name: faker.company.companyName(),
                address: faker.address.streetAddress(),
            }, true)
            companies.push(c)
        }
    })
    console.log('Created Companies')
    let products: Product[] = []
    realm.write(() => {
        for (let index = 0; index < 300; index++) {
            let p = realm.create<Product>(ProductSchema.name, {
                productId: faker.random.uuid(),
                name: faker.commerce.productName(),
                price: faker.random.number({min: 0, max: 5000}),
                company: _.sample(companies)
            }, true)
            products.push(p)
        }
    })

    console.log('Created Products')

    let users: User[] = []
    realm.write(() => {
        for (let index = 0; index < 300; index++) {
            let u = realm.create<User>(UserSchema.name, {
                userId: faker.random.uuid(),
                firstName: faker.name.firstName(),
                lastName: faker.name.lastName(),
                address: faker.address.streetAddress()
            }, true)
            users.push(u)
        }
    })

    console.log('Created Users')

    let orders: Order[] = []
    realm.write(() => {
        for (let index = 0; index < 3000; index++) {
            let o = realm.create<Order>(OrderSchema.name, {
                orderId: faker.random.uuid(),
                timestamp: faker.date.recent(600), // a date from the last 300 days
                products: _.sampleSize(products, faker.random.number({min: 1, max: 30})),
                user: _.sample(users)
            }, true)
            orders.push(o)
        }
    })
    console.log('Created Orders')
    return realm
}