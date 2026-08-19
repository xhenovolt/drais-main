/**
 * @drais/container — .drs read/write.
 * docs/architecture/DRAIS_V2_ARCHITECTURE_AUDIT.md §10, §25 Phase 5.
 *
 * Lands inert, same as Phases 3-4: nothing under src/app/** imports this
 * yet. A future backup/restore flow (roadmap Phase 6) is the first real
 * caller.
 */
export { writeDrsFile, type WriteDrsOptions, type WriteDrsMeta, type WriteDrsResult } from './write-drs';
export {
  readDrsHeader, openDrsFile, type OpenDrsResult,
  DrsFormatError, DrsIntegrityError, DrsDecryptError, DrsVersionError,
} from './read-drs';
export { type DrsHeader, FORMAT_VERSION as DRS_FORMAT_VERSION } from './drs-format';
export { KDF_ALGORITHM, KDF_PARAMS } from './kdf';
export { CIPHER_ALGORITHM } from './aes-gcm';
