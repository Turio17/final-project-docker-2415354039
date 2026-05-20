const express = require('express');
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

dotenv.config();

const {
  DB_HOST = 'db',
  DB_PORT = '3306',
  DB_USER = 'root',
  DB_PASSWORD = 'password',
  DB_NAME = 'userdb',
  APP_PORT = 3000,
} = process.env;

const app = express();
app.use(express.json());

let pool;
async function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function initDb() {
  let retries = 15;
  while (retries > 0) {
    try {
      const connection = await mysql.createConnection({
        host: DB_HOST,
        port: DB_PORT,
        user: DB_USER,
        password: DB_PASSWORD,
      });

      await connection.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\`;`);
      await connection.end();

      pool = mysql.createPool({
        host: DB_HOST,
        port: DB_PORT,
        user: DB_USER,
        password: DB_PASSWORD,
        database: DB_NAME,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
      });

      await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
          id INT AUTO_INCREMENT PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          email VARCHAR(255) NOT NULL UNIQUE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      return;
    } catch (err) {
      retries -= 1;
      console.log(`Menunggu database MySQL... (${15 - retries}/15)`);
      if (retries === 0) {
        throw err;
      }
      await delay(2000);
    }
  }
}

app.get('/users', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, name, email FROM users ORDER BY id');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Gagal mengambil users', details: err.message });
  }
});

app.post('/users', async (req, res) => {
  const { name, email } = req.body;
  if (!name || !email) {
    return res.status(400).json({ error: 'name dan email wajib diisi' });
  }

  try {
    const [result] = await pool.query('INSERT INTO users (name, email) VALUES (?, ?)', [name, email]);
    const [rows] = await pool.query('SELECT id, name, email FROM users WHERE id = ?', [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (err) {
    const message = err.code === 'ER_DUP_ENTRY' ? 'Email sudah digunakan' : 'Gagal membuat user';
    res.status(500).json({ error: message, details: err.message });
  }
});

app.put('/users/:id', async (req, res) => {
  const { id } = req.params;
  const { name, email } = req.body;
  if (!name || !email) {
    return res.status(400).json({ error: 'name dan email wajib diisi' });
  }

  try {
    const [result] = await pool.query('UPDATE users SET name = ?, email = ? WHERE id = ?', [name, email, id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'User tidak ditemukan' });
    }
    const [rows] = await pool.query('SELECT id, name, email FROM users WHERE id = ?', [id]);
    res.json(rows[0]);
  } catch (err) {
    const message = err.code === 'ER_DUP_ENTRY' ? 'Email sudah digunakan' : 'Gagal memperbarui user';
    res.status(500).json({ error: message, details: err.message });
  }
});

app.delete('/users/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const [result] = await pool.query('DELETE FROM users WHERE id = ?', [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'User tidak ditemukan' });
    }
    res.json({ message: 'User berhasil dihapus' });
  } catch (err) {
    res.status(500).json({ error: 'Gagal menghapus user', details: err.message });
  }
});

app.get('/', (_, res) => res.send('User Service is running'));

initDb()
  .then(() => {
    app.listen(APP_PORT, '0.0.0.0', () => {
      console.log(`Server berjalan di port ${APP_PORT}`);
    });
  })
  .catch((err) => {
    console.error('Gagal inisialisasi database', err);
    process.exit(1);
  });
