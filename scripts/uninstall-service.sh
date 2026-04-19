#!/bin/bash

# CD/DVD API Uninstaller - Ubuntu Systemd Service
# Este script remove o serviço do sistema e remove os arquivos de unidade.

SERVICE_NAME="cddvd-api"
SERVICE_FILE="/etc/systemd/system/$SERVICE_NAME.service"

# 1. Verificar privilégios de ROOT
if [[ $EUID -ne 0 ]]; then
   echo "❌ Este script deve ser executado como root (use sudo)." 
   exit 1
fi

echo "🛑 Parando e desativando o serviço $SERVICE_NAME..."

# 2. Parar o serviço se estiver rodando
if systemctl is-active --quiet "$SERVICE_NAME"; then
    echo "⏹️  Parando serviço ativo..."
    systemctl stop "$SERVICE_NAME"
fi

# 3. Desativar o serviço (remover do boot)
if systemctl is-enabled --quiet "$SERVICE_NAME"; then
    echo "🚫 Desativando serviço do boot..."
    systemctl disable "$SERVICE_NAME"
fi

# 4. Remover o arquivo de unidade
if [ -f "$SERVICE_FILE" ]; then
    echo "🗑️  Removendo arquivo de unidade do systemd..."
    rm "$SERVICE_FILE"
    systemctl daemon-reload
else
    echo "⚠️  Aviso: Arquivo de unidade $SERVICE_FILE não encontrado."
fi

echo "✅ Serviço removido do systemd com sucesso!"
echo "Nota: Os arquivos em /opt/$SERVICE_NAME foram mantidos. Caso queira deletar tudo, use: sudo rm -rf /opt/$SERVICE_NAME"
