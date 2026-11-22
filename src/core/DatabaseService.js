/**
 * @file src/core/DatabaseService.js
 * @description คลาส Singleton สำหรับจัดการการเชื่อมต่อ Supabase Database (npm @supabase/supabase-js)
 */

import { createClient } from '@supabase/supabase-js';
import { Config } from './Config.js';

export class DatabaseService {
    static #instance = null;
    #client = null;
    #publicClient = null;

    constructor() {
        if (DatabaseService.#instance) {
            return DatabaseService.#instance;
        }
        this.#initClient();
        DatabaseService.#instance = this;
    }

    static getInstance() {
        if (!DatabaseService.#instance) {
            DatabaseService.#instance = new DatabaseService();
        }
        return DatabaseService.#instance;
    }

    static getActiveSchema() {
        return (typeof Config !== 'undefined' && Config.SUPABASE_SCHEMA) ? Config.SUPABASE_SCHEMA : 'public';
    }

    #initClient() {
        const clientOptions = {
            auth: {
                persistSession: false
            }
        };
        const activeSchema = DatabaseService.getActiveSchema();
        if (activeSchema && activeSchema !== 'public') {
            clientOptions.db = { schema: activeSchema };
        }
        this.#client = createClient(
            Config.SUPABASE_URL,
            Config.SUPABASE_ANON_KEY,
            clientOptions
        );
        this.#publicClient = createClient(
            Config.SUPABASE_URL,
            Config.SUPABASE_ANON_KEY,
            { auth: { persistSession: false } }
        );
    }

    get client() {
        if (!this.#client) {
            this.#initClient();
        }
        return this.#client;
    }

    get publicClient() {
        if (!this.#publicClient) {
            this.#initClient();
        }
        return this.#publicClient;
    }

    get activeSchema() {
        return DatabaseService.getActiveSchema();
    }

    async broadcastRealtimeEvent(eventName, payload = {}) {
        try {
            const channel = this.client.channel('bma_global_realtime_bus');
            await channel.send({
                type: 'broadcast',
                event: eventName,
                payload: { ...payload, schema: DatabaseService.getActiveSchema(), ts: Date.now() }
            });
        } catch (err) {
            console.warn('broadcastRealtimeEvent warning:', err);
        }
    }

    async checkConnection() {
        try {
            const { error } = await this.client
                .from('system_settings')
                .select('id')
                .limit(1);
            if (error && String(error.message || '').includes('The schema must be one of the following: public')) {
                console.warn('[DatabaseService] Schema fallback to public');
                this.#client = this.#publicClient;
                const retry = await this.#client.from('system_settings').select('id').limit(1);
                return !retry.error;
            }
            return !error;
        } catch (err) {
            console.error('Database connection check failed:', err);
            return false;
        }
    }
}
