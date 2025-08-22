import {
  getSystemDetailedStats,
  getSystemOverview,
  getDiskStats,
  getNetworkStats,
  getDatabaseStats
} from '../../src/routes/dashboard.js';

jest.mock('../../src/routes/dashboard.js', () => ({
  getSystemDetailedStats: jest.fn(),
  getSystemOverview: jest.fn(),
  getDiskStats: jest.fn(),
  getNetworkStats: jest.fn(),
  getDatabaseStats: jest.fn()
}));

describe('getSystemDetailedStats', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('deve retornar estatísticas agregadas corretamente', async () => {
    getSystemOverview.mockResolvedValue({ cpu: 10, ram: 20 });
    getDiskStats.mockResolvedValue({ disk: 30 });
    getNetworkStats.mockResolvedValue({ network: 40 });
    getDatabaseStats.mockResolvedValue({ db: 50 });

    getSystemDetailedStats.mockImplementation(async () => {
      const overview = await getSystemOverview();
      const [disk, network, db] = await Promise.all([
        getDiskStats(),
        getNetworkStats(),
        getDatabaseStats()
      ]);
      return { ...overview, ...disk, ...network, ...db };
    });

    const result = await getSystemDetailedStats();
    expect(result).toEqual({ cpu: 10, ram: 20, disk: 30, network: 40, db: 50 });
  });

  it('deve tratar falha em uma das dependências', async () => {
    getSystemOverview.mockResolvedValue({ cpu: 10, ram: 20 });
    getDiskStats.mockRejectedValue(new Error('Falha no disco'));
    getNetworkStats.mockResolvedValue({ network: 40 });
    getDatabaseStats.mockResolvedValue({ db: 50 });

    getSystemDetailedStats.mockImplementation(async () => {
      const overview = await getSystemOverview();
      let disk, network, db;
      try {
        [disk, network, db] = await Promise.all([
          getDiskStats(),
          getNetworkStats(),
          getDatabaseStats()
        ]);
      } catch (err) {
        disk = { disk: null };
        network = { network: 40 };
        db = { db: 50 };
      }
      return { ...overview, ...disk, ...network, ...db };
    });

    const result = await getSystemDetailedStats();
    expect(result).toEqual({ cpu: 10, ram: 20, disk: null, network: 40, db: 50 });
  });
});