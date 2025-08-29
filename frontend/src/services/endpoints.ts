// Configuração centralizada de endpoints da API
// Mapeado a partir das rotas reais do backend (ver backend/src/routes/*.js)

const endpoints = {
  // Autenticação (backend/src/routes/auth.js)
  auth: {
    login: () => '/auth/login',
    register: () => '/auth/register',
    refresh: () => '/auth/refresh',
    logout: () => '/auth/logout',
    me: () => '/auth/me',
    profile: () => '/auth/profile',
    changePassword: () => '/auth/change-password',
    resetPassword: () => '/auth/reset-password',
    forgotPassword: () => '/auth/forgot-password',
    verifyToken: () => '/auth/verify-token'
  },

  // Câmeras (backend/src/routes/cameras.js)
  cameras: {
    getAll: () => '/cameras',
    get: (id: string | number) => `/cameras/${id}`,
    create: () => '/cameras',
    update: (id: string | number) => `/cameras/${id}`,
    delete: (id: string | number) => `/cameras/${id}`,
    updateStatus: (id: string | number) => `/cameras/${id}/status`,
    testConnection: (id: string | number) => `/cameras/${id}/test-connection`,
    getStream: (id: string | number) => `/cameras/${id}/stream`,
    updateThumbnail: (id: string | number) => `/cameras/${id}/thumbnail`,
    getRecordings: (id: string | number) => `/cameras/${id}/recordings`,
    startRecording: (id: string | number) => `/cameras/${id}/recording/start`,
    stopRecording: (id: string | number) => `/cameras/${id}/recording/stop`,
    getRecordingStatus: (id: string | number) => `/cameras/${id}/recording/status`,
    getStats: () => '/cameras/stats',
    getOnline: () => '/cameras/online'
  },

  // Streams (backend/src/routes/streams.js)
  streams: {
    getAll: () => '/streams',
    get: (id: string | number) => `/streams/${id}`,
    start: (cameraId: string | number) => `/streams/${cameraId}/start`,
    stop: (streamId: string | number) => `/streams/${streamId}/stop`,
    getHls: (streamId: string | number) => `/streams/${streamId}/hls`,
    getFlv: (streamId: string | number) => `/streams/${streamId}/flv`,
    getThumbnail: (streamId: string | number) => `/streams/${streamId}/thumbnail`,
    join: (streamId: string | number) => `/streams/${streamId}/join`,
    leave: (streamId: string | number) => `/streams/${streamId}/leave`,
    updateQuality: (streamId: string | number) => `/streams/${streamId}/quality`,
    updateSettings: (streamId: string | number) => `/streams/${streamId}/settings`,
    getViewers: (streamId: string | number) => `/streams/${streamId}/viewers`,
    getStats: () => '/streams/stats'
  },

  // Gravações (backend/src/routes/recordings.js)
  recordings: {
    getAll: () => '/recordings',
    get: (id: string | number) => `/recordings/${id}`,
    create: () => '/recordings',
    delete: (id: string | number) => `/recordings/${id}`,
    deleteMultiple: () => '/recordings',
    start: () => '/recordings/start',
    pause: () => '/recordings/pause',
    resume: () => '/recordings/resume',
    stop: () => '/recordings/stop',
    stopById: (id: string | number) => `/recordings/${id}/stop`,
    download: (id: string | number) => `/recordings/${id}/download`,
    stream: (id: string | number) => `/recordings/${id}/stream`,
    export: () => '/recordings/export',
    exportStatus: (exportId: string | number) => `/recordings/export/${exportId}/status`,
    retryUpload: (id: string | number) => `/recordings/${id}/retry-upload`,
    retrySegmentUpload: (id: string | number, segmentId: string | number) => `/recordings/${id}/segments/${segmentId}/retry-upload`,
    getSegments: (id: string | number) => `/recordings/${id}/segments`,
    getUploadQueue: () => '/recordings/upload-queue',
    toggleUploadQueue: () => '/recordings/upload-queue/toggle',
    getCameraActive: (cameraId: string | number) => `/recordings/camera/${cameraId}/active`,
    updateStatistics: () => '/recordings/update-statistics',
    getStats: () => '/recordings/stats',
    getTrends: () => '/recordings/trends',
    getActive: () => '/recordings/active',
    cleanup: () => '/recordings/cleanup'
  },

  // Usuários (backend/src/routes/users.js)
  users: {
    getAll: () => '/users',
    get: (id: string | number) => `/users/${id}`,
    create: () => '/users',
    update: (id: string | number) => `/users/${id}`,
    delete: (id: string | number) => `/users/${id}`,
    updateStatus: (id: string | number) => `/users/${id}/block`,
    unblock: (id: string | number) => `/users/${id}/unblock`,
    updatePermissions: (id: string | number) => `/users/${id}/permissions`,
    updateCameraAccess: (id: string | number) => `/users/${id}/camera-access`,
    getActivity: (id: string | number) => `/users/${id}/activity`,
    resetPassword: (id: string | number) => `/users/${id}/reset-password`,
    export: () => '/users/export',
    getStats: () => '/users/stats'
  },

  // Segurança (backend/src/routes/security.js - inferido dos usos)
  security: {
    getEvents: () => '/security/events',
    getStats: () => '/security/stats',
    getSettings: () => '/security/settings',
    updateSettings: () => '/security/settings',
    getSessions: () => '/security/sessions',
    terminateSession: (id: string | number) => `/security/sessions/${id}`,
    exportEvents: () => '/security/events/export'
  },

  // Relatórios (backend/src/routes/reports.js)
  reports: {
    generate: () => '/reports/dashboard',
    getActivity: () => '/reports/activity',
    getCameraUsage: () => '/reports/camera-usage',
    export: () => '/reports/export'
  },

  // Logs (backend/src/routes/logs.js)
  logs: {
    getAll: () => '/logs',
    getServices: () => '/logs/services',
    getStats: () => '/logs/stats',
    export: () => '/logs/export',
    create: () => '/logs',
    clear: () => '/logs/clear'
  },

  // Perfil (backend/src/routes/auth.js - usando endpoints de auth para perfil)
  profile: {
    get: () => '/auth/me',
    update: () => '/auth/profile',
    changePassword: () => '/auth/change-password',
    getActivity: () => '/profile/activity', // endpoint inferido
    setup2FA: () => '/profile/2fa/setup', // endpoint inferido
    confirm2FA: () => '/profile/2fa/confirm', // endpoint inferido
    disable2FA: () => '/profile/2fa/disable', // endpoint inferido
    uploadAvatar: () => '/profile/avatar' // endpoint inferido
  },

  // Configurações (inferido dos usos)
  settings: {
    get: () => '/settings',
    update: () => '/settings',
    getStorage: () => '/settings/storage',
    testEmail: () => '/settings/test-email',
    testBackup: () => '/settings/test-backup',
    cleanupLogs: () => '/settings/cleanup/logs',
    cleanupRecordings: () => '/settings/cleanup/recordings'
  },

  // Health (backend/src/routes/health.js)
  health: {
    auth: () => '/health/auth',
    authAlerts: () => '/health/auth/alerts',
    resolveAlert: (alertId: string | number) => `/health/auth/alerts/${alertId}/resolve`,
    system: () => '/health/system'
  },

  // Dashboard (backend/src/routes/dashboard.js)
  dashboard: {
    overview: () => '/dashboard/overview',
    cameras: () => '/dashboard/cameras',
    recordings: () => '/dashboard/recordings',
    system: () => '/dashboard/system',
    activity: () => '/dashboard/activity',
    alerts: () => '/dashboard/alerts',
    performance: () => '/dashboard/performance',
    storage: () => '/dashboard/storage',
    stats: () => '/dashboard/stats'
  },

  // Métricas (backend/src/routes/metrics.js)
  metrics: {
    getAll: () => '/metrics',
    getByCategory: (category: string) => `/metrics/${category}`,
    getHistory: (category: string) => `/metrics/${category}/history`,
    getAlerts: () => '/metrics/system/alerts',
    startCollection: () => '/metrics/collection/start',
    stopCollection: () => '/metrics/collection/stop',
    forceCollection: () => '/metrics/collection/force',
    getStatus: () => '/metrics/collection/status'
  },

  // Discovery (backend/src/routes/discovery.js)
  discovery: {
    scan: () => '/discovery/scan',
    getScan: (scanId: string | number) => `/discovery/scan/${scanId}`,
    getScans: () => '/discovery/scans',
    testDevice: () => '/discovery/test-device',
    addCamera: () => '/discovery/add-camera',
    deleteScan: (scanId: string | number) => `/discovery/scan/${scanId}`
  },

  // Files (backend/src/routes/files.js)
  files: {
    list: () => '/files',
    search: () => '/files/search',
    getStats: () => '/files/stats',
    getInfo: (filename: string) => `/files/${filename}/info`,
    download: (filename: string) => `/files/${filename}/download`,
    upload: () => '/files/upload',
    delete: (filename: string) => `/files/${filename}`,
    move: (filename: string) => `/files/${filename}/move`
  }
};

export default endpoints;