const bcrypt = require('bcryptjs');
const { MongoClient } = require('mongodb');

(async () => {
  const client = new MongoClient(process.env.MONGO_URI);
  await client.connect();
  const sitios = client.db(process.env.DB_NAME || 'PruebaBBDD').collection('sitios');
  let n = 0;
  for await (const s of sitios.find({})) {
    if (typeof s.password !== 'string' || /^\$2[aby]\$/.test(s.password)) continue;   // ya es un hash
    await sitios.updateOne({ _id: s._id }, { $set: { password: await bcrypt.hash(s.password, 10) } });
    n++;
  }
  await sitios.createIndex({ usuarioAdmin: 1 }, { unique: true });   // falla si hay usuarios repetidos
  console.log(`${n} contraseña(s) hasheadas`);
  await client.close();
})();