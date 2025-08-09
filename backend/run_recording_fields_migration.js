import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';

// Load environment variables
config();

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Supabase configuration
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in environment variables');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function runMigration() {
    try {
        console.log('🚀 Starting recordings table migration...');
        
        // Read the migration SQL file
        const migrationPath = path.join(__dirname, 'src', 'database', 'migrations', 'add_recording_fields.sql');
        
        if (!fs.existsSync(migrationPath)) {
            console.error(`❌ Migration file not found: ${migrationPath}`);
            process.exit(1);
        }
        
        const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
        
        console.log('📄 Migration SQL loaded successfully');
        console.log('🔄 Executing migration...');
        
        // Execute the migration
        const { data, error } = await supabase.rpc('exec_sql', {
            sql: migrationSQL
        });
        
        if (error) {
            console.error('❌ Migration failed:', error.message);
            console.log('\n📋 Manual execution required:');
            console.log('Please run the following SQL manually in your Supabase SQL editor:');
            console.log('\n' + '='.repeat(50));
            console.log(migrationSQL);
            console.log('='.repeat(50));
            process.exit(1);
        }
        
        console.log('✅ Migration completed successfully!');
        
        // Verify the migration by checking if the new columns exist
        console.log('🔍 Verifying migration...');
        
        const { data: tableInfo, error: verifyError } = await supabase
            .from('information_schema.columns')
            .select('column_name')
            .eq('table_name', 'recordings')
            .eq('table_schema', 'public')
            .in('column_name', ['s3_url', 'upload_status', 'local_path', 'upload_attempts', 'uploaded_at', 'error_message']);
        
        if (verifyError) {
            console.warn('⚠️  Could not verify migration, but it may have succeeded');
        } else {
            const addedColumns = tableInfo.map(row => row.column_name);
            console.log('✅ Verified columns added:', addedColumns.join(', '));
            
            const expectedColumns = ['s3_url', 'upload_status', 'local_path', 'upload_attempts', 'uploaded_at', 'error_message'];
            const missingColumns = expectedColumns.filter(col => !addedColumns.includes(col));
            
            if (missingColumns.length > 0) {
                console.warn('⚠️  Some columns may not have been added:', missingColumns.join(', '));
            } else {
                console.log('🎉 All required columns have been successfully added!');
            }
        }
        
    } catch (error) {
        console.error('❌ Unexpected error during migration:', error.message);
        console.log('\n📋 Manual execution may be required.');
        process.exit(1);
    }
}

// Run the migration
runMigration().then(() => {
    console.log('\n🏁 Migration process completed.');
    process.exit(0);
}).catch((error) => {
    console.error('💥 Fatal error:', error.message);
    process.exit(1);
});

// Handle process termination
process.on('SIGINT', () => {
    console.log('\n⏹️  Migration interrupted by user');
    process.exit(1);
});

process.on('SIGTERM', () => {
    console.log('\n⏹️  Migration terminated');
    process.exit(1);
});