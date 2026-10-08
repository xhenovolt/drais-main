import { queryOnline, getConnectionOnline } from '@/lib/db';

/** Control Center is a platform service and always reads/writes the hosted DB. */
export const query = queryOnline;
export const getConnection = getConnectionOnline;