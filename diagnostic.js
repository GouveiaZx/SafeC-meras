#!/usr/bin/env node

/**
 * Script de diagnóstico completo para o sistema NewCAM
 * Verifica todas as conexões: backend, frontend, ZLMediaKit, Supabase
 */

import axios from 'axios';
import { execSync } from 'child_process';

// Configurações
const CONFIG = {
  backend: {
    url: 'http://localhost:3002',
    api: 'http://localhost:3002/api'
  },
  zlmediakit: {
    url: 'http://localhost:8000',
    api: 'http://localhost:8000/index/api',
    secret: '9QqL3M2K7vHQexkbfp6RvbCUB3GkV4MK'
  },
  frontend: {
    url: 'http://localhost:5174'
  },
  supabase: {
    url: 'https://grkvfzuadctextnbpajb.supabase.co'
  }
};

class Diagnostic {
  constructor() {
    this.results = {
      backend: {},
      zlmediakit: {},
      frontend: {},
      supabase: {},
      cameras: {},
      streaming: {}
    };
  }

  async run() {
    console.log('🚀 Iniciando diagnóstico completo do sistema NewCAM...\n');

    await this.checkBackend();
    await this.checkZLMediaKit();
    await this.checkFrontend();
    await this.checkSupabase();
    await this.checkCameras();
    await this.checkStreaming();

    this.printResults();
  }

  async checkBackend() {
    console.log('🔍 Verificando backend...');
    try {
      const response = await axios.get(`${CONFIG.backend.api}/health`);
      this.results.backend.health = response.status === 200 ? '✅ OK' : '❌ Falhou';
    } catch (error) {
      this.results.backend.health = `❌ Erro: ${error.message}`;
    }

    try {
      const response = await axios.get(`${CONFIG.backend.api}/cameras`);
      this.results.backend.cameras = response.status === 200 ? '✅ OK' : '❌ Falhou';
    } catch (error) {
      this.results.backend.cameras = `❌ Erro: ${error.message}`;
    }

    try {
      const response = await axios.get(`${CONFIG.backend.api}/streams/test-zlm`);
      this.results.backend.zlm = response.status === 200 ? '✅ OK' : '❌ Falhou';
    } catch (error) {
      this.results.backend.zlm = `❌ Erro: ${error.message}`;
    }
  }

  async checkZLMediaKit() {
    console.log('🔍 Verificando ZLMediaKit...');
    try {
      const response = await axios.get(`${CONFIG.zlmediakit.api}/getServerConfig?secret=${CONFIG.zlmediakit.secret}`);
      this.results.zlmediakit.server = response.status === 200 ? '✅ OK' : '❌ Falhou';
      this.results.zlmediakit.version = response.data?.data?.[0]?.['general.serverName'] || 'Desconhecido';
    } catch (error) {
      this.results.zlmediakit.server = `❌ Erro: ${error.message}`;
    }

    try {
      const response = await axios.get(`${CONFIG.zlmediakit.api}/getMediaList?secret=${CONFIG.zlmediakit.secret}`);
      this.results.zlmediakit.streams = response.status === 200 ? '✅ OK' : '❌ Falhou';
      this.results.zlmediakit.activeStreams = response.data?.data?.length || 0;
    } catch (error) {
      this.results.zlmediakit.streams = `❌ Erro: ${error.message}`;
    }
  }

  async checkFrontend() {
    console.log('🔍 Verificando frontend...');
    try {
      const response = await axios.get(CONFIG.frontend.url);
      this.results.frontend.server = response.status === 200 ? '✅ OK' : '❌ Falhou';
    } catch (error) {
      this.results.frontend.server = `❌ Erro: ${error.message}`;
    }
  }

  async checkSupabase() {
    console.log('🔍 Verificando Supabase...');
    try {
      const response = await axios.get(`${CONFIG.supabase.url}/rest/v1/cameras?select=id&limit=1`, {
        headers: {
          'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdya3ZmenVhZGN0ZXh0bmJwYWpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMyMjQyMzgsImV4cCI6MjA2ODgwMDIzOH0.Simv8hH8aE9adQiTf6t1BZIcMPniNh9ecpjxEeki4mE'
        }
      });
      this.results.supabase.connection = response.status === 200 ? '✅ OK' : '❌ Falhou';
    } catch (error) {
      this.results.supabase.connection = `❌ Erro: ${error.message}`;
    }
  }

  async checkCameras() {
    console.log('🔍 Verificando câmeras...');
    try {
      const response = await axios.get(`${CONFIG.backend.api}/cameras`);
      if (response.status === 200 && response.data?.data) {
        this.results.cameras.count = response.data.data.length;
        this.results.cameras.sample = response.data.data.slice(0, 3).map(c => ({
          id: c.id,
          name: c.name,
          status: c.status,
          is_streaming: c.is_streaming
        }));
      }
    } catch (error) {
      this.results.cameras.error = error.message;
    }
  }

  async checkStreaming() {
    console.log('🔍 Verificando streaming...');
    try {
      const response = await axios.get(`${CONFIG.backend.api}/streams/stats`);
      this.results.streaming.stats = response.status === 200 ? '✅ OK' : '❌ Falhou';
      if (response.data?.data) {
        this.results.streaming.active = response.data.data.active_streams;
      }
    } catch (error) {
      this.results.streaming.stats = `❌ Erro: ${error.message}`;
    }
  }

  printResults() {
    console.log('\n📊 RESULTADOS DO DIAGNÓSTICO:\n');
    
    console.log('🖥️  BACKEND:');
    Object.entries(this.results.backend).forEach(([key, value]) => {
      console.log(`   ${key}: ${value}`);
    });

    console.log('\n🎥 ZLMEDIAKIT:');
    Object.entries(this.results.zlmediakit).forEach(([key, value]) => {
      console.log(`   ${key}: ${value}`);
    });

    console.log('\n🌐 FRONTEND:');
    Object.entries(this.results.frontend).forEach(([key, value]) => {
      console.log(`   ${key}: ${value}`);
    });

    console.log('\n🗄️  SUPABASE:');
    Object.entries(this.results.supabase).forEach(([key, value]) => {
      console.log(`   ${key}: ${value}`);
    });

    console.log('\n📹 CÂMERAS:');
    if (this.results.cameras.count !== undefined) {
      console.log(`   Total: ${this.results.cameras.count}`);
      console.log('   Amostra:', JSON.stringify(this.results.cameras.sample, null, 2));
    } else {
      console.log(`   Erro: ${this.results.cameras.error}`);
    }

    console.log('\n🔄 STREAMING:');
    Object.entries(this.results.streaming).forEach(([key, value]) => {
      console.log(`   ${key}: ${value}`);
    });

    console.log('\n🔧 RECOMENDAÇÕES:');
    console.log('1. Verifique se todas as portas estão abertas: 3002 (backend), 8000 (ZLMediaKit), 5174 (frontend)');
    console.log('2. Confirme que o ZLMediaKit está rodando: http://localhost:8000');
    console.log('3. Teste as URLs de streaming diretamente no navegador');
    console.log('4. Verifique os logs do backend para erros detalhados');
  }
}

// Executar diagnóstico
if (import.meta.url === `file://${process.argv[1]}`) {
  const diagnostic = new Diagnostic();
  diagnostic.run().catch(console.error);
}

export default Diagnostic;