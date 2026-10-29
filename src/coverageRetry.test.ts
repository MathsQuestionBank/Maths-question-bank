import {describe,expect,it,vi} from 'vitest';
import {isTransientCoverageConnectionError,withCoverageRetry} from './coverageRetry';

describe('coverage during Supabase connection pressure',()=>{
 it('recognises transient pool errors without treating owner permissions as transient',()=>{
  expect(isTransientCoverageConnectionError(new Error('Too many connections issued to the database'))).toBe(true);
  expect(isTransientCoverageConnectionError({code:'53300',message:'remaining connection slots are reserved'})).toBe(true);
  expect(isTransientCoverageConnectionError({code:'PGRST003',message:'Timed out acquiring connection in pool'})).toBe(true);
  expect(isTransientCoverageConnectionError({code:'42501',message:'permission denied'})).toBe(false);
 });
 it('recovers a brief connection error without retrying indefinitely',async()=>{
  const call=vi.fn()
   .mockRejectedValueOnce(new Error('Too many connections issued to the database'))
   .mockResolvedValueOnce('ok');
  const pause=vi.fn().mockResolvedValue(undefined);
  await expect(withCoverageRetry(call,pause)).resolves.toBe('ok');
  expect(call).toHaveBeenCalledTimes(2);
  expect(pause).toHaveBeenCalledWith(500);
 });
 it('limits retries to two and preserves the original failure if saturation continues',async()=>{
  const call=vi.fn().mockRejectedValue(new Error('Too many connections issued to the database'));
  const pause=vi.fn().mockResolvedValue(undefined);
  await expect(withCoverageRetry(call,pause)).rejects.toThrow('Too many connections');
  expect(call).toHaveBeenCalledTimes(3);
  expect(pause).toHaveBeenCalledTimes(2);
 });
 it('never retries permission failures',async()=>{
  const call=vi.fn().mockRejectedValue({code:'42501',message:'Access denied'});
  const pause=vi.fn().mockResolvedValue(undefined);
  await expect(withCoverageRetry(call,pause)).rejects.toMatchObject({code:'42501'});
  expect(call).toHaveBeenCalledTimes(1);
  expect(pause).not.toHaveBeenCalled();
 });
 it('stops retrying once the coverage view is no longer active',async()=>{
  const call=vi.fn().mockRejectedValue(new Error('Too many connections'));
  const pause=vi.fn().mockResolvedValue(undefined);
  await expect(withCoverageRetry(call,pause,()=>false)).rejects.toThrow('Too many connections');
  expect(call).toHaveBeenCalledTimes(1);
  expect(pause).not.toHaveBeenCalled();
 });
});
