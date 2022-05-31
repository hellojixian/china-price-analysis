const config = require('./config');
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database(config.DBFile);

const reportName = '国内农产品现货价格';
const startFrom = '2020-01-01';
const sourceSQL = `select * from product where region = '国内' and type='xh' and category='lntx';`;
const priceSQL = `select * from price where seqno=? and date>'${startFrom}' order by date asc;`;
const tradeDateSQL = `select distinct date as date from price where date>'${startFrom}' order by date asc;`;

(async () => {
  const productList = await new Promise(resolve => db.all(sourceSQL, async (err, rows) => resolve(rows)));
  // fetch product seqno list
  const dataFrame = {};
  for (const product of productList) {
    const priceList = await new Promise(resolve => db.all(priceSQL, product['seqno'], async (err, rows) => resolve(rows)));
    const series = {};
    for (const i in priceList) {
      let change = 0, value=100;
      const currentPrice = priceList[i]['price'];
      const currentDate = priceList[i]['date'];
      if (i > 0) {
        const previousPrice = priceList[i-1]['price'];
        const previousValue = series[priceList[i-1]['date']]['value'] || 100;
        change = (currentPrice - previousPrice) / previousPrice;
        value = previousValue * (1 + change);
      }
      series[currentDate] = {
        price: currentPrice,
        change: change,
        value: value,
      }
    }
    dataFrame[product['name']] = series;
  }

  // export csv
  // print header
  let header = '日期,';
  for (const product of productList) header += `${product['name']},`
  header = header.substring(0, header.length-1);
  console.log(header);

  const dateList = await new Promise(resolve => db.all(tradeDateSQL, async (err, rows) => resolve(rows)));
  for (const date of dateList){
    const currentDate = date['date'];
    let row = `${currentDate},`;
    for (const product of productList) {
      let data = '';
      if (dataFrame[product['name']][currentDate]) data = dataFrame[product['name']][currentDate]['value'].toFixed(2);
      row += `${data},`;
    }
    row = row.substring(0, row.length-1);
    console.log(row);
  }

})();