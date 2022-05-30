
const request = require('ajax-request');
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database(':memory:');

const DataSource = 'http://price.mofcom.gov.cn'
const productCategory = {
  lntx: '粮农土畜',
  nyhg: '能源化工',
  jskc: '金属矿产',
}
const productType = {
  xh: '现货',
  qh: '期货',
}

// settings
const RequestBatchSize = 15 //每次请求的数据条目
const PausePerRequest = 300 //每次请求的时间间隔（毫秒）

const getDataRows = async (seqno) => {
  let records = []
  let pageNumber = 1
  let maxPages = null
  const _fetch = async() => {
    console.log(`  Requesting for page ${pageNumber}`)
    const url = `${DataSource}/datamofcom/front/price/pricequotation/priceQueryList?seqno=${seqno}&pageNumber=${pageNumber}&pageSize=${RequestBatchSize}`
    return new Promise((resolve, reject) => {
      request.post({
        url: url,
      }, function(err, res, body) {
        try {
          data = JSON.parse(body)
          // saving data
          maxPages = maxPages || data.maxPageNum
          resolve(data.rows)
        } catch(e) {
          reject(err)
        }
      })
    })
  }
  while(!maxPages || pageNumber <= maxPages) {
    records = records.concat(await _fetch())
    await new Promise(resolve => setTimeout(resolve, PausePerRequest));
    pageNumber++
  }
  console.log(`  Total: ${records.length} records`)
  return records
}

const getProductList = async (type='xh', category='lntx') => {
  let records = []
  let pageNumber = 1
  let maxPages = null
  const _fetch = async() => {
    console.log(`  Requesting for page ${pageNumber}`)
    const url = `${DataSource}/datamofcom/front/price/pricequotation/codeDetailQuery?flag=${type}&prod_type=${category}&pageNumber=${pageNumber}&pageSize=${RequestBatchSize}`
    return new Promise((resolve, reject) => {
      request.post({
        url: url,
      }, function(err, res, body) {
        try {
          data = JSON.parse(body)
          // saving data
          maxPages = maxPages || data.maxPageNum
          resolve(data.rows)
        } catch(e) {
          reject(err)
        }
      })
    })
  }
  while(!maxPages || pageNumber <= maxPages) {
    records = records.concat(await _fetch())
    await new Promise(resolve => setTimeout(resolve, PausePerRequest));
    pageNumber++
  }
  console.log(`  Total: ${records.length} records`)
  return records
}

(async () => {
  //fetch product list
  // const productList = await getProductList()
  // const data = await getDataRows(320)
  for (pType of Object.keys(productType)) {
    for (pCategory of Object.keys(productCategory)) {
      console.log(`Fetching data for ${productType[pType]} - ${productCategory[pCategory]}:`)
      const productList = await getProductList(pType, pCategory)
    }
  }
})()