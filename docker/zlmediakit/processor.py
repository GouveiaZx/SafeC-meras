#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import os
import time
import requests
import json
import logging
import threading
from datetime import datetime, timedelta
from flask import Flask, jsonify
import glob
import subprocess
from pathlib import Path

# Configurar logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Configurações
RECORDINGS_DIR = '/opt/media/bin/www/record/proxy/'
WWW_DIR = '/opt/media/bin/www'
API_ENDPOINT = os.getenv('API_ENDPOINT', 'http://ns1.infotecms.com.br:8087/segmentos')
WASABI_BUCKET = os.getenv('WASABI_BUCKET', 'safe-cameras-03')
WASABI_ENDPOINT = os.getenv('WASABI_ENDPOINT', 'https://s3.us-east-2.wasabisys.com')
WASABI_ACCESS_KEY = os.getenv('WASABI_ACCESS_KEY')
WASABI_SECRET_KEY = os.getenv('WASABI_SECRET_KEY')
PROCESS_INTERVAL = int(os.getenv('PROCESS_INTERVAL', '300'))  # 5 minutos

app = Flask(__name__)

def setup_directories():
    """Cria diretórios necessários"""
    os.makedirs(RECORDINGS_DIR, exist_ok=True)
    os.makedirs(WWW_DIR, exist_ok=True)
    logger.info(f"Diretório de gravações: {RECORDINGS_DIR}")
    logger.info(f"Diretório WWW: {WWW_DIR}")

def get_recording_files():
    """Obtém lista de arquivos de gravação"""
    try:
        # Buscar arquivos MP4 nas subpastas
        pattern = os.path.join(RECORDINGS_DIR, '**', '*.mp4')
        files = glob.glob(pattern, recursive=True)
        
        # Filtrar arquivos mais antigos que 5 minutos (para garantir que a gravação terminou)
        current_time = datetime.now()
        old_files = []
        
        for file_path in files:
            try:
                file_time = datetime.fromtimestamp(os.path.getmtime(file_path))
                if current_time - file_time > timedelta(minutes=5):
                    old_files.append(file_path)
            except Exception as e:
                logger.error(f"Erro ao verificar arquivo {file_path}: {e}")
        
        return old_files
        
    except Exception as e:
        logger.error(f"Erro ao buscar arquivos de gravação: {e}")
        return []

def process_video_file(file_path):
    """Processa um arquivo de vídeo"""
    try:
        logger.info(f"Processando arquivo: {file_path}")
        
        # Extrair informações do caminho do arquivo
        path_parts = Path(file_path).parts
        if len(path_parts) < 3:
            logger.error(f"Caminho de arquivo inválido: {file_path}")
            return False
        
        # Assumindo estrutura: /recordings/camera_id/YYYY-MM-DD/arquivo.mp4
        camera_id = path_parts[-3] if len(path_parts) >= 3 else 'unknown'
        date_folder = path_parts[-2] if len(path_parts) >= 2 else 'unknown'
        filename = path_parts[-1]
        
        # Gerar thumbnail
        thumbnail_path = generate_thumbnail(file_path)
        
        # Obter informações do vídeo
        video_info = get_video_info(file_path)
        
        # Upload para S3 (se configurado)
        s3_url = None
        if WASABI_ACCESS_KEY and WASABI_SECRET_KEY:
            s3_url = upload_to_s3(file_path, camera_id, date_folder, filename)
        
        # Enviar informações para API
        send_to_api({
            'camera_id': camera_id,
            'filename': filename,
            'file_path': file_path,
            'date_folder': date_folder,
            'thumbnail_path': thumbnail_path,
            's3_url': s3_url,
            'video_info': video_info,
            'processed_at': datetime.now().isoformat()
        })
        
        # Mover arquivo processado (opcional)
        move_processed_file(file_path)
        
        logger.info(f"Arquivo processado com sucesso: {filename}")
        return True
        
    except Exception as e:
        logger.error(f"Erro ao processar arquivo {file_path}: {e}")
        return False

def generate_thumbnail(video_path):
    """Gera thumbnail do vídeo"""
    try:
        thumbnail_dir = os.path.join(WWW_DIR, 'thumbnails')
        os.makedirs(thumbnail_dir, exist_ok=True)
        
        filename = os.path.basename(video_path)
        thumbnail_name = f"{os.path.splitext(filename)[0]}.jpg"
        thumbnail_path = os.path.join(thumbnail_dir, thumbnail_name)
        
        # Usar ffmpeg para gerar thumbnail
        cmd = [
            'ffmpeg',
            '-i', video_path,
            '-ss', '00:00:01',  # Capturar no segundo 1
            '-vframes', '1',
            '-y',  # Sobrescrever se existir
            thumbnail_path
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        
        if result.returncode == 0 and os.path.exists(thumbnail_path):
            logger.info(f"Thumbnail gerado: {thumbnail_path}")
            return thumbnail_path
        else:
            logger.error(f"Erro ao gerar thumbnail: {result.stderr}")
            
    except Exception as e:
        logger.error(f"Erro ao gerar thumbnail para {video_path}: {e}")
    
    return None

def get_video_info(video_path):
    """Obtém informações do vídeo usando ffprobe"""
    try:
        cmd = [
            'ffprobe',
            '-v', 'quiet',
            '-print_format', 'json',
            '-show_format',
            '-show_streams',
            video_path
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        
        if result.returncode == 0:
            info = json.loads(result.stdout)
            
            # Extrair informações relevantes
            format_info = info.get('format', {})
            video_stream = None
            
            for stream in info.get('streams', []):
                if stream.get('codec_type') == 'video':
                    video_stream = stream
                    break
            
            return {
                'duration': float(format_info.get('duration', 0)),
                'size': int(format_info.get('size', 0)),
                'bitrate': int(format_info.get('bit_rate', 0)),
                'width': int(video_stream.get('width', 0)) if video_stream else 0,
                'height': int(video_stream.get('height', 0)) if video_stream else 0,
                'codec': video_stream.get('codec_name', '') if video_stream else '',
                'fps': eval(video_stream.get('r_frame_rate', '0/1')) if video_stream else 0
            }
            
    except Exception as e:
        logger.error(f"Erro ao obter informações do vídeo {video_path}: {e}")
    
    return {}

def upload_to_s3(file_path, camera_id, date_folder, filename):
    """Upload do arquivo para S3/Wasabi"""
    try:
        # Implementar upload para S3 aqui
        # Por enquanto, apenas simular
        logger.info(f"Simulando upload para S3: {filename}")
        
        # Retornar URL simulada
        s3_key = f"recordings/{camera_id}/{date_folder}/{filename}"
        s3_url = f"{WASABI_ENDPOINT}/{WASABI_BUCKET}/{s3_key}"
        
        return s3_url
        
    except Exception as e:
        logger.error(f"Erro ao fazer upload para S3: {e}")
        return None

def send_to_api(data):
    """Envia informações do arquivo processado para API"""
    try:
        logger.info(f"Enviando dados para API: {API_ENDPOINT}")
        
        response = requests.post(
            API_ENDPOINT,
            json=data,
            timeout=30,
            headers={'Content-Type': 'application/json'}
        )
        
        if response.status_code == 200:
            logger.info("Dados enviados com sucesso para API")
        else:
            logger.error(f"Erro ao enviar para API: HTTP {response.status_code}")
            logger.error(f"Resposta: {response.text}")
            
    except Exception as e:
        logger.error(f"Erro ao enviar dados para API: {e}")

def move_processed_file(file_path):
    """Move arquivo processado para diretório de processados"""
    try:
        processed_dir = os.path.join(RECORDINGS_DIR, 'processed')
        os.makedirs(processed_dir, exist_ok=True)
        
        filename = os.path.basename(file_path)
        new_path = os.path.join(processed_dir, filename)
        
        # Mover arquivo
        os.rename(file_path, new_path)
        logger.info(f"Arquivo movido para: {new_path}")
        
    except Exception as e:
        logger.error(f"Erro ao mover arquivo processado: {e}")

def process_recordings():
    """Processa todos os arquivos de gravação pendentes"""
    logger.info("Iniciando processamento de gravações...")
    
    files = get_recording_files()
    logger.info(f"Encontrados {len(files)} arquivos para processar")
    
    processed_count = 0
    for file_path in files:
        if process_video_file(file_path):
            processed_count += 1
        
        # Aguardar entre processamentos
        time.sleep(1)
    
    logger.info(f"Processamento concluído. {processed_count}/{len(files)} arquivos processados")

def process_worker():
    """Worker thread para processamento periódico"""
    while True:
        try:
            process_recordings()
        except Exception as e:
            logger.error(f"Erro no processamento: {e}")
        
        time.sleep(PROCESS_INTERVAL)

@app.route('/health')
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'service': 'processor',
        'timestamp': datetime.now().isoformat()
    })

@app.route('/process')
def manual_process():
    """Endpoint para processamento manual"""
    try:
        process_recordings()
        return jsonify({
            'status': 'success',
            'message': 'Processamento executado com sucesso'
        })
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500

def main():
    """Função principal"""
    logger.info("Iniciando serviço de processamento de gravações...")
    logger.info(f"API Endpoint configurado: {API_ENDPOINT}")
    logger.info(f"Diretório de gravações: {RECORDINGS_DIR}")
    
    # Configurar diretórios
    setup_directories()
    
    # Executar processamento inicial
    process_recordings()
    
    # Iniciar worker thread para processamento periódico
    process_thread = threading.Thread(target=process_worker, daemon=True)
    process_thread.start()
    
    # Iniciar servidor Flask para health check
    logger.info("Iniciando servidor de health check na porta 8080...")
    app.run(host='0.0.0.0', port=8080, debug=False)

if __name__ == '__main__':
    main()