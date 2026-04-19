import pino from 'pino';

// Detectar se está rodando dentro do executável empacotado (pkg)
const isBundled = (process as any).pkg !== undefined;

export const logger = pino({
  level: 'info',
  ...(isBundled ? {} : {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
      },
    },
  }),
});
