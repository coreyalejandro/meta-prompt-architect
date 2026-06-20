import { get, set } from 'idb-keyval';
import { HistoryItem, MemoryState } from '../types';
import { encryptData, decryptData } from './crypto';

const HISTORY_KEY = 'architect_history';
const MEMORY_KEY = 'architect_memory';
const WORKSPACE_KEY = 'architect_workspace';
const RETENTION_DAYS = 30; // Auto-purge history older than 30 days

export const storage = {
  async getWorkspace(): Promise<any | null> {
    try {
      const data = await get<any>(WORKSPACE_KEY);
      if (!data) return null;
      return data;
    } catch (e) {
      console.error('Failed to get workspace from IndexedDB', e);
      return null;
    }
  },

  async saveWorkspace(workspace: any): Promise<void> {
    try {
      await set(WORKSPACE_KEY, workspace);
    } catch (e) {
      console.error('Failed to save workspace to IndexedDB', e);
    }
  },

  async getHistory(): Promise<HistoryItem[]> {
    try {
      const data = await get<any>(HISTORY_KEY);
      if (!data) return [];
      
      let parsedData: HistoryItem[] = [];
      
      if (data instanceof Uint8Array) {
        // Data is encrypted
        parsedData = await decryptData(data);
      } else if (Array.isArray(data)) {
        // Legacy unencrypted data, migrate it
        parsedData = data;
        await this.saveHistory(parsedData);
      } else {
        return [];
      }
      
      // Implement data retention policy (Recommendation #8)
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - RETENTION_DAYS);
      
      const filteredData = parsedData.filter(item => new Date(item.timestamp) > cutoffDate);
      
      // If we filtered out old items, update storage
      if (filteredData.length < parsedData.length) {
        await this.saveHistory(filteredData);
      }
      
      return filteredData;
    } catch (e) {
      console.error('Failed to get history from IndexedDB', e);
      return [];
    }
  },

  async saveHistory(history: HistoryItem[]): Promise<void> {
    try {
      const encrypted = await encryptData(history);
      await set(HISTORY_KEY, encrypted);
    } catch (e) {
      console.error('Failed to save history to IndexedDB', e);
    }
  },

  async getMemory(): Promise<MemoryState[]> {
    try {
      const data = await get<MemoryState[]>(MEMORY_KEY);
      return data || [];
    } catch (e) {
      console.error('Failed to get memory from IndexedDB', e);
      return [];
    }
  },

  async saveMemory(memory: MemoryState[]): Promise<void> {
    try {
      await set(MEMORY_KEY, memory);
    } catch (e) {
      console.error('Failed to save memory to IndexedDB', e);
    }
  },

  async getCustomTemplates(): Promise<any[]> {
    try {
      const data = await get<any[]>('architect_custom_templates');
      return data || [];
    } catch (e) {
      console.error('Failed to get custom templates from IndexedDB', e);
      return [];
    }
  },

  async saveCustomTemplates(templates: any[]): Promise<void> {
    try {
      await set('architect_custom_templates', templates);
    } catch (e) {
      console.error('Failed to save custom templates to IndexedDB', e);
    }
  },

  // Migration from localStorage
  async migrateFromLocalStorage(): Promise<void> {
    try {
      const localHistory = localStorage.getItem(HISTORY_KEY);
      if (localHistory) {
        const parsedHistory = JSON.parse(localHistory);
        await this.saveHistory(parsedHistory);
        localStorage.removeItem(HISTORY_KEY);
      }

      const localMemory = localStorage.getItem(MEMORY_KEY);
      if (localMemory) {
        const parsedMemory = JSON.parse(localMemory);
        await this.saveMemory(parsedMemory);
        localStorage.removeItem(MEMORY_KEY);
      }
    } catch (e) {
      console.error('Failed to migrate from localStorage', e);
    }
  }
};
