/**
 * RTMP Pool Manager Page
 *
 * Administrative interface for managing the RTMP stream pool.
 * Displays all streams with their status, assigned cameras, and provides
 * actions for pool management (sync, refill, release).
 *
 * Features:
 * - View all streams in pool with status indicators
 * - Filter by status (available, assigned, streaming, error)
 * - Real-time stats dashboard (total, available, utilization)
 * - Manual sync with SRS server
 * - Pool refill controls
 * - Release individual streams
 * - View assigned camera details
 */

import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { toast } from 'sonner';

interface RTMPStream {
  id: string;
  sequential_number: number;
  stream_key: string;
  rtmp_url: string;
  full_url: string;
  status: 'available' | 'assigned' | 'streaming' | 'error' | 'reserved';
  camera_id: string | null;
  assigned_at: string | null;
  stream_started_at: string | null;
  last_stream_at: string | null;
  cameras?: {
    id: string;
    name: string;
    status: string;
  };
}

interface PoolStats {
  total: number;
  available: number;
  assigned: number;
  streaming: number;
  error: number;
  reserved: number;
  utilizationPercent: number;
}

export default function RTMPPoolManager() {
  const [streams, setStreams] = useState<RTMPStream[]>([]);
  const [stats, setStats] = useState<PoolStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [refilling, setRefilling] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const limit = 50;

  useEffect(() => {
    fetchPoolData();
    fetchStats();

    // Auto-refresh every 30 seconds
    const interval = setInterval(() => {
      fetchStats();
    }, 30000);

    return () => clearInterval(interval);
  }, [page, filterStatus]);

  const fetchPoolData = async () => {
    try {
      setLoading(true);
      const params: any = { page, limit };
      if (filterStatus !== 'all') {
        params.status = filterStatus;
      }

      const response = await api.get('/rtmp/pool', { params }) as any;
      setStreams(response.data?.data || response.data || []);
      setTotalPages(response.data?.pagination?.pages || response.pagination?.pages || 1);
    } catch (error: any) {
      console.error('Error fetching pool data:', error);
      toast.error('Failed to load RTMP pool data');
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await api.get('/rtmp/stats') as any;
      setStats(response.data?.data || response.data || null);
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const handleSync = async () => {
    try {
      setSyncing(true);
      toast.loading('Syncing with SRS server...', { id: 'sync' });

      const response = await api.post('/rtmp/sync') as any;

      if (response.data?.success || response.success) {
        toast.success(`Sync completed: ${response.data?.data?.updated || response.data?.updated || 0} streams updated`, { id: 'sync' });
        fetchPoolData();
        fetchStats();
      } else {
        toast.error('Sync failed', { id: 'sync' });
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to sync with SRS', { id: 'sync' });
    } finally {
      setSyncing(false);
    }
  };

  const handleRefill = async () => {
    try {
      setRefilling(true);
      toast.loading('Refilling pool...', { id: 'refill' });

      const response = await api.post('/rtmp/refill', { count: 50 }) as any;

      if (response.data?.success || response.success) {
        toast.success(`Added ${response.data?.data?.added || response.data?.added || 0} streams to pool`, { id: 'refill' });
        fetchPoolData();
        fetchStats();
      } else {
        toast.error('Refill failed', { id: 'refill' });
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to refill pool', { id: 'refill' });
    } finally {
      setRefilling(false);
    }
  };

  const handleRelease = async (streamId: string, streamKey: string) => {
    if (!confirm(`Release stream ${streamKey}? This will make it available for new cameras.`)) {
      return;
    }

    try {
      toast.loading('Releasing stream...', { id: 'release' });

      await api.delete(`/rtmp/${streamId}/release`);

      toast.success('Stream released successfully', { id: 'release' });
      fetchPoolData();
      fetchStats();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to release stream', { id: 'release' });
    }
  };

  const handleInitialize = async () => {
    if (!confirm('Initialize pool with default streams? This should only be done once on first setup.')) {
      return;
    }

    try {
      toast.loading('Initializing pool...', { id: 'init' });

      const response = await api.post('/rtmp/initialize') as any;

      if (response.data?.success || response.success) {
        toast.success(response.data?.message || response.message || 'Pool initialized', { id: 'init' });
        fetchPoolData();
        fetchStats();
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to initialize pool', { id: 'init' });
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'available':
        return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
      case 'assigned':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
      case 'streaming':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400';
      case 'error':
        return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
      case 'reserved':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400';
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            RTMP Stream Pool Manager
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Manage sequential RTMP URLs from SRS server
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleSync}
            disabled={syncing}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
          >
            {syncing ? (
              <>
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Syncing...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Sync with SRS
              </>
            )}
          </button>

          <button
            onClick={handleRefill}
            disabled={refilling}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
          >
            {refilling ? 'Refilling...' : 'Refill Pool (+50)'}
          </button>

          <button
            onClick={handleInitialize}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-2"
          >
            Initialize Pool
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
            <div className="text-sm text-gray-600 dark:text-gray-400">Total Streams</div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{stats.total}</div>
          </div>

          <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
            <div className="text-sm text-gray-600 dark:text-gray-400">Available</div>
            <div className="text-2xl font-bold text-green-600 mt-1">{stats.available}</div>
          </div>

          <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
            <div className="text-sm text-gray-600 dark:text-gray-400">Assigned</div>
            <div className="text-2xl font-bold text-blue-600 mt-1">{stats.assigned}</div>
          </div>

          <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
            <div className="text-sm text-gray-600 dark:text-gray-400">Streaming</div>
            <div className="text-2xl font-bold text-purple-600 mt-1">{stats.streaming}</div>
          </div>

          <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
            <div className="text-sm text-gray-600 dark:text-gray-400">Utilization</div>
            <div className="text-2xl font-bold text-indigo-600 mt-1">{stats.utilizationPercent}%</div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
        <div className="flex items-center gap-4">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Filter by Status:</label>
          <select
            value={filterStatus}
            onChange={(e) => {
              setFilterStatus(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          >
            <option value="all">All Streams</option>
            <option value="available">Available</option>
            <option value="assigned">Assigned</option>
            <option value="streaming">Streaming</option>
            <option value="error">Error</option>
            <option value="reserved">Reserved</option>
          </select>
        </div>
      </div>

      {/* Streams Table */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">#</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Stream Key</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Full URL</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Assigned Camera</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Assigned At</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Last Stream</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                    Loading streams...
                  </td>
                </tr>
              ) : streams.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                    No streams found. Click "Initialize Pool" to create streams.
                  </td>
                </tr>
              ) : (
                streams.map((stream) => (
                  <tr key={stream.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-white font-mono">
                      {stream.sequential_number}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-white font-mono">
                      {stream.stream_key}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 font-mono max-w-xs truncate">
                      {stream.full_url}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(stream.status)}`}>
                        {stream.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                      {stream.cameras ? (
                        <div>
                          <div className="font-medium">{stream.cameras.name}</div>
                          <div className="text-xs text-gray-500">{stream.cameras.status}</div>
                        </div>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                      {formatDate(stream.assigned_at)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                      {formatDate(stream.last_stream_at)}
                    </td>
                    <td className="px-4 py-3">
                      {stream.status === 'assigned' || stream.status === 'streaming' ? (
                        <button
                          onClick={() => handleRelease(stream.id, stream.stream_key)}
                          className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 text-sm font-medium"
                        >
                          Release
                        </button>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <div className="text-sm text-gray-600 dark:text-gray-400">
              Page {page} of {totalPages}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
