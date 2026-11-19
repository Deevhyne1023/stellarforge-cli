import { createBackendServer, getBackendConfig } from './server.js';

const config = getBackendConfig();
const server = createBackendServer();

server.listen(config.port, '127.0.0.1');
