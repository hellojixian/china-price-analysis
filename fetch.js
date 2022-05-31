const config = require('./config');
const request = require('ajax-request');
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database(config.DBFile);

const DataSource = 'http://price.mofcom.gov.cn';
const productCategory = {
  lntx: '粮农土畜',
  nyhg: '能源化工',
  jskc: '金属矿产',
};
const productType = {
  xh: '现货',
  qh: '期货',
};

// settings
const RequestBatchSize = 50; //每次请求的数据条目
const MaxPricePagesPerProduct = 20; //每个品种历史价格最大回溯页数
const PausePerRequest = 300; //每次请求的时间间隔（毫秒）

const FetchProduct = false;
const FetchPrice = true;

const VERBOSE = config.Verbose;
const getPriceData = async (seqno) => {
  let records = [];
  let pageNumber = 1;
  let maxPages = null;
  const _fetch = async() => {
    if (VERBOSE) console.log(`  Requesting for page ${pageNumber} / ${maxPages||0}`)
    const url = `${DataSource}/datamofcom/front/price/pricequotation/priceQueryList?seqno=${seqno}&pageNumber=${pageNumber}&pageSize=${RequestBatchSize}`
    return new Promise((resolve, reject) => {
      request.post({
        url: url,
      }, function(err, res, body) {
        try {
          data = JSON.parse(body);
          // saving data
          maxPages = maxPages || data.maxPageNum;
          resolve(data.rows);
        } catch(e) {
          reject(err);
        }
      })
    })
  }
  while(!maxPages || pageNumber <= maxPages) {
    if (pageNumber >= MaxPricePagesPerProduct) break;
    records = records.concat(await _fetch());
    await new Promise(resolve => setTimeout(resolve, PausePerRequest));
    pageNumber++;
  }
  if (VERBOSE) console.log(`  Total: ${records.length} records`);
  return records;
};

const getProductList = async (type='xh', category='lntx') => {
  let records = [];
  let pageNumber = 1;
  let maxPages = null;
  const _fetch = async() => {
    if (VERBOSE) console.log(`  Requesting for page ${pageNumber} / ${maxPages||0}`)
    const url = `${DataSource}/datamofcom/front/price/pricequotation/codeDetailQuery?flag=${type}&prod_type=${category}&pageNumber=${pageNumber}&pageSize=${RequestBatchSize}`
    return new Promise((resolve, reject) => {
      request.post({
        url: url,
      }, function(err, res, body) {
        try {
          data = JSON.parse(body);
          // saving data
          maxPages = maxPages || data.maxPageNum;
          resolve(data.rows);
        } catch(e) {
          reject(err);
        }
      })
    })
  }
  while(!maxPages || pageNumber <= maxPages) {
    records = records.concat(await _fetch());
    await new Promise(resolve => setTimeout(resolve, PausePerRequest));
    pageNumber++;
  }
  if (VERBOSE) console.log(`  Total: ${records.length} records`);
  return records;
};

const prepareDB = async () => {
  const createProductTable = new Promise(resolve => {
    const sql = `
    CREATE TABLE IF NOT EXISTS "product" (
      [seqno] INTEGER PRIMARY KEY NOT NULL,
      [type] TEXT NOT NULL,
      [category] TEXT NOT NULL,
      [category_name] TEXT NOT NULL,
      [name] TEXT NOT NULL,
      [region] TEXT NULL,
      [unit] TEXT NULL,
      [spec] TEXT NULL
  );
  `;
    db.run(sql, resolve);
  })
  const createPriceTable = new Promise(resolve => {
    const sql = `
    CREATE TABLE IF NOT EXISTS "price" (
      [id] INTEGER PRIMARY KEY AUTOINCREMENT,
      [seqno] INTEGER NOT NULL,
      [date] TEXT NOT NULL,
      [price] NUMERIC NOT NULL,
      UNIQUE(seqno,date)
    );
    `;
    db.run(sql, resolve);
  })
  return Promise.all([createProductTable, createPriceTable])
};


(async () => {
  await prepareDB();
  if (FetchProduct) {
    const insertProductSQL = `INSERT INTO product (seqno, type, category, category_name, name, spec) VALUES (?,?,?,?,?,?);`;
    if (VERBOSE) console.log(`\nFetching product list`);
    for (pType of Object.keys(productType)) {
      for (pCategory of Object.keys(productCategory)) {
        const categoryName = `${productType[pType]} - ${productCategory[pCategory]}`
        if (VERBOSE) console.log(`Fetching product list for ${categoryName[pType]}:`)
        const productList = await getProductList(pType, pCategory);
        for (const product of productList) {
          await new Promise(resolve => db.run(insertProductSQL,
            [product['seqno'], pType, pCategory, categoryName, product['prod_name'], product['prod_spec']],
            resolve));
        }
      }
    }
  }
  if (FetchPrice) {
    const updateProductSQL = `UPDATE product SET region=?, unit=? WHERE seqno=?;`;
    const insertPriceSQL = `INSERT INTO price (seqno, date, price) VALUES (?,?,?) ON CONFLICT(seqno, date) DO UPDATE SET price=? WHERE seqno=? AND date=?;`;
    if (VERBOSE) console.log(`\nFetching product price`);
    await new Promise(resolve => db.all("SELECT * FROM product", async (err, rows) => {
      for(const product of rows) {
        let productMetaUpdated = false;
        if (VERBOSE) console.log(`Fetching product price for ${product['category_name']} - ${product['name']}:`)
        const priceList = await getPriceData(product['seqno']);
        for (const price of priceList) {
          if (productMetaUpdated == false) {
            await new Promise(resolve => db.run(updateProductSQL,
              [price['region'], price['unit'], product['seqno']],
              resolve));
            productMetaUpdated = true;
          }
          const priceDate = `${price['yyyy']}-${price['mm']}-${price['dd']}`;
          await new Promise(resolve => db.run(insertPriceSQL,
            [product['seqno'], priceDate, Number(price['price']).toFixed(2), Number(price['price']).toFixed(2), product['seqno', priceDate]],
            resolve));
        }
      }
      resolve();
    }))
  }
})();