#!/bin/bash

# CD/DVD API Installer - Ubuntu Systemd Service
# Este script configura o binário compilado como um serviço do sistema.

SERVICE_NAME="cddvd-api"
INSTALL_DIR="/opt/$SERVICE_NAME"
BINARY_NAME="cddvd-ubuntu-api" # Nome gerado pelo pkg baseado no name do package.json
SERVICE_FILE="/etc/systemd/system/$SERVICE_NAME.service"

# 1. Verificar privilégios de ROOT
if [[ $EUID -ne 0 ]]; then
   echo "❌ Este script deve ser executado como root (use sudo)." 
   exit 1
fi

echo "🚀 Iniciando instalação do serviço $SERVICE_NAME..."

# 2. Criar diretório de instalação se não existir
mkdir -p "$INSTALL_DIR"
mkdir -p "$INSTALL_DIR/logs"

# 3. Mover o binário para o local final (assume que você rodou o build e está na pasta raiz)
if [ -f "./bin/$BINARY_NAME" ]; then
    echo "📦 Binário encontrado. Movendo para $INSTALL_DIR..."
    cp "./bin/$BINARY_NAME" "$INSTALL_DIR/executable"
    chmod +x "$INSTALL_DIR/executable"
else
    echo "⚠️  AVISO: Binário ./bin/$BINARY_NAME não encontrado."
    echo "Certifique-se de rodar 'npm run build:exe' antes de instalar."
    # Não saímos aqui, pois o usuário pode mover manualmente depois.
fi

# 4. Criar .env básico se não existir
if [ ! -f "$INSTALL_DIR/.env" ]; then
    echo "📝 Criando arquivo .env padrão..."
    cat <<EOT > "$INSTALL_DIR/.env"
PORT=48271
ISOS_DIR=/home/rafarvns/isos
DRIVE_DEVICE=/dev/sr0
EOT
fi

# 5. Criar o arquivo de Unidade do Systemd
echo "⚙️  Configurando systemd unit..."
cat <<EOT > "$SERVICE_FILE"
[Unit]
Description=Backend API for PS1/PS2 CD/DVD Burning
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$INSTALL_DIR
ExecStart=$INSTALL_DIR/executable
Restart=always
RestartSec=10
StandardOutput=append:$INSTALL_DIR/logs/stdout.log
StandardError=append:$INSTALL_DIR/logs/stderr.log

[Install]
WantedBy=multi-user.target
EOT

# 6. Recarregar e Iniciar
echo "🔄 Recarregando daemons e ativando serviço..."
systemctl daemon-reload
systemctl enable "$SERVICE_NAME"
# systemctl start "$SERVICE_NAME" # Opcional: não iniciaremos agora para o usuário configurar o .env se precisar

echo "✅ Instalação concluída com sucesso!"
echo "------------------------------------------------"
echo "Comandos úteis:"
echo "  - Iniciar: sudo systemctl start $SERVICE_NAME"
echo "  - Status:  sudo systemctl status $SERVICE_NAME"
echo "  - Logs:    tail -f $INSTALL_DIR/logs/stdout.log"
echo "------------------------------------------------"
