// postgresql://neondb_owner:npg_SrjI32xbMNVh@ep-divine-heart-a8ggbce0-pooler.eastus2.azure.neon.tech/neondb?sslmode=require

import { neon } from "@neondatabase/serverless";

import {drizzle} from 'drizzle-orm/neon-http';

import * as schema from './schema';

const sql = neon(process.env.DATABASE_URL);

export const db = drizzle(sql, {schema});