export const QIX_SERVICE = 'c2e6fd00-e966-1000-8000-bef9c223df6a'
export const QIX_NOTIFY = 'c2e6fd01-e966-1000-8000-bef9c223df6a'
export const QIX_WRITE = 'c2e6fd02-e966-1000-8000-bef9c223df6a'
export const QIX_CTRL = 'c2e6fd03-e966-1000-8000-bef9c223df6a'
export const ADV_SERVICE = '0000fd00-0000-1000-8000-00805f9b34fb'
export const RCSP_SERVICE = '0000ae00-0000-1000-8000-00805f9b34fb'
export const RCSP_WRITE = '0000ae01-0000-1000-8000-00805f9b34fb'
export const RCSP_NOTIFY = '0000ae02-0000-1000-8000-00805f9b34fb'
export const CMD = {
  DATA: 1,
  GET_TARGET_INFO: 3,
  GET_SYS_INFO: 7,
  START_FILE_BROWSE: 12,
  START: 27,
  STOP: 28,
  OP: 29,
  DEL_DEV_FILE: 31,
  GET_NAME: 32,
  PREPARE_ENV: 33,
  EXT_PARAM: 39,
} as const
export const QIX_CMD = {
  BIND: 96,
  RET_BIND: 97,
  SET_FILE_TYPE: 0xdc,
  REQ_BADGE_INFO: 0xc6,
  REP_BADGE_INFO: 0xc7,
  SEND_RESPONSE: 0xff,
} as const
export const FILE_TYPE_BADGE = 0x0c
export const STORAGE_DEV = 2
