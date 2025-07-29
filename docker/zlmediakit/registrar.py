#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import os
import time
import requests
import json
import logging
from datetime import datetime
from flask import Flask, jsonify
import threading

# Configurar logging
logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s] — %(message)s',
    datefmt='%a %b %d %H:%M:%S %Z %Y'
)
logger = logging.getLogger(__name__)

# Configurações
ZLM_BASE_URL = os.getenv('ZLM_BASE_URL', 'http://zlmediakit:8000')
ZLM_SECRET = os.getenv('ZLM_SECRET', '9QqL3M2K7vHQexkbfp6RvbCUB3GkV4MK')
API_ENDPOINT = os.getenv('API_ENDPOINT', 'http://host.docker.internal:3002/api')
INTERNAL_SERVICE_TOKEN = os.getenv('INTERNAL_SERVICE_TOKEN', 'newcam-internal-service-2025')
SYNC_INTERVAL = int(os.getenv('SYNC_INTERVAL', '300'))  # 5 minutos

app = Flask(__name__)

def wait_for_zlmediakit():
    """Aguarda o ZLMediaKit estar disponível"""
    logger.info("Esperando o ZLMediaKit iniciar...")
    while True:
        try:
            response = requests.get(f"{ZLM_BASE_URL}/index/api/getServerConfig?secret={ZLM_SECRET}", timeout=5)
            if response.status_code == 200:
                logger.info("ZLMediaKit está pronto. Iniciando sincronização de câmeras.")
                break
        except Exception as e:
            logger.debug(f"ZLMediaKit ainda não está pronto: {e}")
            time.sleep(5)

def enable_global_recording():
    """Habilita gravação MP4 globalmente"""
    try:
        logger.info("Habilitando gravação MP4 globalmente...")
        response = requests.get(
            f"{ZLM_BASE_URL}/index/api/setServerConfig",
            params={
                'secret': ZLM_SECRET,
                'record.enableMP4': '1',
                'record.fileSecond': '3600',
                'record.filePath': './record/proxy/',
                'record.enableHLS': '1'
            },
            timeout=10
        )
        
        if response.status_code == 200:
            result = response.json()
            logger.info(f"Resposta da API para gravação global: {json.dumps(result, indent=2)}")
            if result.get('code') == 0:
                logger.info("Gravação MP4 habilitada com sucesso")
            else:
                logger.error(f"Erro ao habilitar gravação: {result.get('msg')}")
        else:
            logger.error(f"Erro HTTP ao configurar gravação: {response.status_code}")
            
    except Exception as e:
        logger.error(f"Erro ao habilitar gravação global: {e}")

def get_enabled_cameras():
    """Busca câmeras habilitadas na API"""
    try:
        logger.info("Buscando câmeras habilitadas na API remota...")
        headers = {
            'X-Service-Token': INTERNAL_SERVICE_TOKEN,
            'Content-Type': 'application/json'
        }
        response = requests.get(f"{API_ENDPOINT}/cameras", headers=headers, timeout=10)
        
        if response.status_code == 200:
            cameras = response.json()
            if isinstance(cameras, dict) and 'data' in cameras:
                cameras = cameras['data']
            
            enabled_cameras = []
            for camera in cameras:
                if camera.get('status') == 'online' and camera.get('rtsp_url'):
                    enabled_cameras.append(camera)
            
            logger.info(f"Encontradas {len(enabled_cameras)} câmeras habilitadas")
            return enabled_cameras
        else:
            logger.error(f"Erro ao buscar câmeras: HTTP {response.status_code}")
            logger.error(f"Resposta da API: {response.text[:200]}...")
            
    except Exception as e:
        logger.error(f"ERRO: Falha ao obter dados da API de câmeras ou resposta inválida")
        logger.error(f"Resposta da API: ...")
        
    logger.info("Nenhuma câmera habilitada encontrada")
    return []

def get_active_streams():
    """Obtém lista de streams ativos do ZLMediaKit"""
    try:
        logger.info("Obtendo lista de streams ativos do ZLMediaKit...")
        response = requests.get(
            f"{ZLM_BASE_URL}/index/api/getMediaList",
            params={'secret': ZLM_SECRET},
            timeout=10
        )
        
        if response.status_code == 200:
            result = response.json()
            if result.get('code') == 0:
                streams = result.get('data', [])
                logger.info(f"Encontrados {len(streams)} streams ativos")
                return streams
            else:
                logger.error(f"Erro na API ZLM: {result.get('msg')}")
        else:
            logger.error(f"Erro HTTP ao obter streams: {response.status_code}")
            
    except Exception as e:
        logger.error(f"Erro ao obter streams ativos: {e}")
    
    logger.info("Nenhum stream ativo encontrado no ZLMediaKit")
    return []

def start_camera_stream(camera):
    """Inicia stream de uma câmera específica"""
    try:
        camera_id = camera.get('id')
        rtsp_url = camera.get('rtsp_url')
        name = camera.get('name', f'Camera_{camera_id}')
        
        logger.info(f"Iniciando stream para câmera: {name} ({camera_id})")
        
        # Usar addStreamProxy para adicionar stream RTSP
        response = requests.get(
            f"{ZLM_BASE_URL}/index/api/addStreamProxy",
            params={
                'secret': ZLM_SECRET,
                'vhost': '__defaultVhost__',
                'app': 'live',
                'stream': camera_id,
                'url': rtsp_url,
                'enable_rtsp': '1',
                'enable_rtmp': '1',
                'enable_hls': '1',
                'enable_mp4': '1'
            },
            timeout=15
        )
        
        if response.status_code == 200:
            result = response.json()
            if result.get('code') == 0:
                logger.info(f"Stream iniciado com sucesso para {name}: {result.get('data')}")
                return True
            else:
                logger.error(f"Erro ao iniciar stream para {name}: {result.get('msg')}")
        else:
            logger.error(f"Erro HTTP ao iniciar stream para {name}: {response.status_code}")
            
    except Exception as e:
        logger.error(f"Erro ao iniciar stream para câmera {camera.get('id')}: {e}")
    
    return False

def sync_cameras():
    """Sincroniza câmeras com ZLMediaKit"""
    logger.info("Sincronizando câmeras...")
    
    # Obter câmeras habilitadas
    cameras = get_enabled_cameras()
    
    # Obter streams ativos
    active_streams = get_active_streams()
    active_stream_ids = [stream.get('stream') for stream in active_streams]
    
    # Iniciar streams para câmeras que não estão ativas
    for camera in cameras:
        camera_id = camera.get('id')
        if camera_id not in active_stream_ids:
            start_camera_stream(camera)
            time.sleep(2)  # Aguardar entre tentativas
    
    # Verificar diretório de gravações
    check_recordings_directory()
    
    logger.info("Sincronização concluída.")

def check_recordings_directory():
    """Verifica diretório de gravações"""
    try:
        logger.info("Verificando diretório de gravações...")
        recordings_dir = "/opt/media/bin/www/record/proxy/"
        
        if os.path.exists(recordings_dir):
            files = os.listdir(recordings_dir)
            logger.info(f"Existem {len(files)} arquivos de gravação no diretório")
        else:
            logger.info("Diretório de gravações não existe, criando...")
            os.makedirs(recordings_dir, exist_ok=True)
            
    except Exception as e:
        logger.error(f"Erro ao verificar diretório de gravações: {e}")

def sync_worker():
    """Worker thread para sincronização periódica"""
    while True:
        try:
            sync_cameras()
        except Exception as e:
            logger.error(f"Erro na sincronização: {e}")
        
        time.sleep(SYNC_INTERVAL)

@app.route('/health')
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'service': 'zlm-registrar',
        'timestamp': datetime.now().isoformat()
    })

@app.route('/sync')
def manual_sync():
    """Endpoint para sincronização manual"""
    try:
        sync_cameras()
        return jsonify({
            'status': 'success',
            'message': 'Sincronização executada com sucesso'
        })
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500

def main():
    """Função principal"""
    logger.info("Iniciando ZLM Registrar...")
    
    # Aguardar ZLMediaKit
    wait_for_zlmediakit()
    
    # Configurar gravação global
    enable_global_recording()
    
    # Executar sincronização inicial
    sync_cameras()
    
    # Iniciar worker thread para sincronização periódica
    sync_thread = threading.Thread(target=sync_worker, daemon=True)
    sync_thread.start()
    
    # Iniciar servidor Flask para health check
    logger.info("Iniciando servidor de health check na porta 8080...")
    app.run(host='0.0.0.0', port=8080, debug=False)

if __name__ == '__main__':
    main()