import { Connection, ConnectionOptions } from 'typeorm';
import * as mysql from 'mysql2/promise';
import { ConfigService } from 'nestjs-config';
import { HttpException, Logger } from '@nestjs/common';

export function initDatabase() {
  mysql
    .createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASS,
      port: parseInt(process.env.DB_PORT),
    })
    .then(async (conn) => {
      const [rows] = await conn.execute(`SHOW DATABASES LIKE '${process.env.DB_DATABASE}'`);
      if (Array.isArray(rows) && rows.length === 0) {
        await conn.execute(`CREATE DATABASE ${process.env.DB_DATABASE}`);
        Logger.log(
          `初始化创建数据库成功、数据库名为[${process.env.DB_DATABASE}]`,
        );
      }
      await conn.end();
    });
}

