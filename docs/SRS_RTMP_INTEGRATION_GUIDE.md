# SRS RTMP Dynamic URL Integration - Complete Guide

## 📋 Overview

This document provides complete instructions for integrating the SRS (Simple Realtime Server) dynamic RTMP URL generation system into NewCAM. This system allows cameras to receive sequentially-generated RTMP URLs for streaming.

## ✅ What Has Been Implemented

### Backend Components (✓ Complete)

1. **Database Schema** (`backend/migrations/20250110_create_rtmp_stream_pool.sql`)
   - `rtmp_stream_pool` table for URL management
   - Automatic triggers for camera deletion
   - Indexes for performance

2. **SRS Integration Service** (`backend/src/services/SRSIntegrationService.js`)
   - `requestNewStreamUrl()` - Request next available URL
   - `releaseStreamUrl()` - Release URL back to pool
   - `syncWithSRS()` - Synchronize with SRS server
   - `refillPool()` - Add new URLs to pool
   - `handleStreamEvent()` - Process SRS webhooks

3. **API Routes** (`backend/src/routes/rtmpPool.js`)
   - `POST /api/rtmp/request-url` - Request new RTMP URL
   - `GET /api/rtmp/pool` - List all streams
   - `GET /api/rtmp/stats` - Pool statistics
   - `POST /api/rtmp/sync` - Manual sync
   - `DELETE /api/rtmp/:id/release` - Release stream

4. **SRS Webhooks** (`backend/src/routes/srsWebhooks.js`)
   - `POST /api/srs/webhook/on-publish` - Stream started
   - `POST /api/srs/webhook/on-unpublish` - Stream stopped

5. **Environment Configuration** (`.env` and `.env.example`)
   - Complete SRS configuration variables

### Frontend Components (✓ Complete)

1. **RTMP Pool Manager Page** (`frontend/src/pages/RTMPPoolManager.tsx`)
   - View all streams with status
   - Filter by status
   - Sync and refill controls
   - Statistics dashboard

2. **RTMP Config Display Component** (`frontend/src/components/RTMPConfigDisplay.tsx`)
   - Display generated RTMP URLs
   - Copy-to-clipboard functionality
   - Configuration instructions

## 🔧 Required Manual Steps

### Step 1: Run Database Migration

```bash
# Connect to your Supabase database and run:
cd backend
psql $SUPABASE_URL -f migrations/20250110_create_rtmp_stream_pool.sql

# Or use Supabase SQL Editor to execute the migration
```

### Step 2: Configure Environment Variables

Update `backend/.env` with your SRS server details:

```env
# SRS Server Configuration
SRS_API_URL=http://YOUR_SRS_SERVER:1985/api/v1
SRS_HTTP_PORT=8081
SRS_RTMP_PORT=1936
SRS_SERVER_HOST=YOUR_SRS_SERVER_IP_OR_DOMAIN
SRS_API_SECRET=your-secret-if-any
SRS_WEBHOOK_SECRET=your-webhook-secret

# Pool Configuration
SRS_STREAM_APP=live
SRS_STREAM_KEY_PREFIX=stream
SRS_STREAM_KEY_PADDING=3
RTMP_POOL_SIZE=100
RTMP_POOL_REFILL_THRESHOLD=10
```

### Step 3: Configure SRS Server Webhooks

Edit your SRS configuration file (usually `srs.conf`):

```nginx
http_hooks {
    enabled on;
    on_publish http://YOUR_BACKEND_SERVER:3002/api/srs/webhook/on-publish;
    on_unpublish http://YOUR_BACKEND_SERVER:3002/api/srs/webhook/on-unpublish;
}

vhost __defaultVhost__ {
    http_hooks {
        enabled on;
        on_publish http://YOUR_BACKEND_SERVER:3002/api/srs/webhook/on-publish;
        on_unpublish http://YOUR_BACKEND_SERVER:3002/api/srs/webhook/on-unpublish;
    }
}
```

Replace `YOUR_BACKEND_SERVER` with your NewCAM backend IP/domain.

### Step 4: Enhance Camera Modal with RTMP Generation

Add the following to `frontend/src/pages/Cameras.tsx`:

#### 4.1 Add Import

```typescript
import RTMPConfigDisplay from '../components/RTMPConfigDisplay';
```

#### 4.2 Add State Variables (after line 71)

```typescript
const [rtmpStreamConfig, setRtmpStreamConfig] = useState<any>(null);
const [generatingRtmp, setGeneratingRtmp] = useState(false);
const [useDynamicRtmp, setUseDynamicRtmp] = useState(false);
```

#### 4.3 Add Generate RTMP Handler (before handleSubmit)

```typescript
const handleGenerateRtmpUrl = async () => {
  try {
    setGeneratingRtmp(true);

    // Temporary camera ID for preview (will be replaced after save)
    const tempCameraId = 'temp-' + Date.now();

    const response = await api.post('/rtmp/request-url', {
      cameraId: tempCameraId
    });

    if (response.data.success) {
      setRtmpStreamConfig(response.data.data);
      setUseDynamicRtmp(true);

      // Auto-fill RTMP URL
      setFormData(prev => ({
        ...prev,
        rtmp_url: response.data.data.fullUrl,
        stream_type: 'rtmp'
      }));

      toast.success('URL RTMP gerada com sucesso!');
    }
  } catch (error: any) {
    console.error('Error generating RTMP URL:', error);
    toast.error(error.response?.data?.message || 'Failed to generate RTMP URL');
  } finally {
    setGeneratingRtmp(false);
  }
};
```

#### 4.4 Update RTMP Section in Modal (replace lines 1087-1106)

```tsx
{formData.stream_type === 'rtmp' && (
  <div className="space-y-4">
    {/* Dynamic RTMP Option */}
    <div className="flex items-center justify-between p-3 bg-blue-50 border border-blue-200 rounded-lg">
      <div>
        <h4 className="text-sm font-medium text-blue-900">RTMP Dinâmico (Recomendado)</h4>
        <p className="text-xs text-blue-700 mt-1">
          Gera URL sequencial automaticamente do servidor SRS
        </p>
      </div>
      <button
        type="button"
        onClick={handleGenerateRtmpUrl}
        disabled={generatingRtmp || useDynamicRtmp}
        className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
      >
        {generatingRtmp ? 'Gerando...' : useDynamicRtmp ? 'URL Gerada' : 'Gerar URL RTMP'}
      </button>
    </div>

    {/* Display Generated RTMP Config */}
    {useDynamicRtmp && rtmpStreamConfig && (
      <RTMPConfigDisplay
        streamConfig={rtmpStreamConfig}
        loading={generatingRtmp}
      />
    )}

    {/* Manual RTMP Input (Fallback) */}
    {!useDynamicRtmp && (
      <div>
        <label htmlFor="rtmp_url" className="block text-sm font-medium text-gray-700 mb-1">
          URL RTMP Manual (Opcional)
        </label>
        <input
          type="text"
          id="rtmp_url"
          name="rtmp_url"
          value={formData.rtmp_url}
          onChange={handleInputChange}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
          placeholder="rtmp://servidor:1935/live/stream"
        />
        <p className="text-xs text-gray-500 mt-1">
          Deixe em branco para usar RTMP dinâmico ou insira URL manualmente
        </p>
      </div>
    )}
  </div>
)}
```

### Step 5: Add RTMP Pool Manager Route

In `frontend/src/App.tsx`, add the route:

```tsx
import RTMPPoolManager from './pages/RTMPPoolManager';

// Inside Routes:
<Route path="/rtmp-pool" element={<RTMPPoolManager />} />
```

### Step 6: Add Menu Item to Sidebar

In `frontend/src/components/layout/Sidebar.tsx`, add:

```tsx
<Link
  to="/rtmp-pool"
  className="flex items-center px-4 py-3 text-gray-700 hover:bg-gray-100"
>
  <Server className="h-5 w-5 mr-3" />
  <span>RTMP Pool</span>
</Link>
```

### Step 7: Initialize RTMP Pool

After starting the backend, initialize the pool:

```bash
curl -X POST http://localhost:3002/api/rtmp/initialize \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json"
```

Or use the "Initialize Pool" button in the RTMP Pool Manager UI.

## 🚀 Testing the Integration

### 1. Initialize Pool
- Go to RTMP Pool Manager
- Click "Initialize Pool"
- Verify 100 streams are created

### 2. Create Camera with Dynamic RTMP
- Go to Cameras page
- Click "Add Camera"
- Select stream type "RTMP"
- Click "Generate RTMP URL"
- Copy the URL and configure your physical camera

### 3. Verify Stream Detection
- After camera starts streaming
- Check RTMP Pool Manager
- Stream should show status "streaming"
- Camera status should update to "online"

### 4. Test Sync
- In RTMP Pool Manager
- Click "Sync with SRS"
- Verify statuses match actual SRS state

## 📊 API Endpoints Reference

### RTMP Pool Management

```
POST   /api/rtmp/request-url         - Request new RTMP URL
GET    /api/rtmp/pool                - List all streams
GET    /api/rtmp/available           - Get available count
GET    /api/rtmp/stats               - Get statistics
DELETE /api/rtmp/:id/release         - Release stream
POST   /api/rtmp/sync                - Sync with SRS
POST   /api/rtmp/refill              - Refill pool
POST   /api/rtmp/initialize          - Initialize pool
GET    /api/rtmp/camera/:cameraId    - Get camera stream
```

### SRS Webhooks (Called by SRS)

```
POST   /api/srs/webhook/on-publish   - Stream started
POST   /api/srs/webhook/on-unpublish - Stream stopped
```

## 🔍 Troubleshooting

### Problem: Pool is empty
**Solution**: Run initialization endpoint or click "Initialize Pool" in UI

### Problem: SRS webhooks not working
**Solution**:
- Verify SRS configuration has correct backend URL
- Check firewall allows SRS → Backend communication
- Verify webhook endpoint is accessible: `curl http://localhost:3002/api/srs/webhook/health`

### Problem: Streams show "assigned" but camera is streaming
**Solution**: Click "Sync with SRS" to synchronize states

### Problem: Cannot generate new URLs
**Solution**: Check available streams count, refill pool if needed

## 📝 Database Tables

### rtmp_stream_pool
- `id` - UUID primary key
- `sequential_number` - Sequential number (1, 2, 3...)
- `stream_key` - Stream key (stream001, stream002...)
- `rtmp_url` - Base RTMP server URL
- `full_url` - Complete RTMP URL
- `status` - available | assigned | streaming | error
- `camera_id` - Linked camera (NULL if available)
- `assigned_at` - Assignment timestamp
- `stream_started_at` - Last stream start
- `last_stream_at` - Last activity

## 🎯 Key Features

✅ Sequential URL generation (stream001, stream002, ...)
✅ Automatic pool management and refill
✅ Real-time sync with SRS server
✅ Automatic stream status detection via webhooks
✅ Copy-to-clipboard for easy camera configuration
✅ Visual status indicators (available, assigned, streaming)
✅ Automatic URL release when camera is deleted
✅ Admin dashboard for pool monitoring

## 🔐 Security Notes

- SRS webhooks use optional signature verification via `SRS_WEBHOOK_SECRET`
- RTMP Pool API requires JWT authentication
- Stream keys are hidden by default in UI
- Only admin/operator roles can manage pool

## 📞 Support

For issues or questions:
1. Check logs: `backend/storage/logs/`
2. Review SRS logs: `docker logs newcam-srs`
3. Verify database migrations ran successfully
4. Ensure SRS server is accessible from backend

---

**Implementation Status**: Backend ✅ Complete | Frontend 🟡 Requires Manual Integration

**Estimated Time to Complete Manual Steps**: 30-45 minutes

**Next Steps**: Follow Steps 1-7 above to complete integration
