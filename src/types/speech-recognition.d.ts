/**
 * Web Speech API 类型声明（浏览器原生 SpeechRecognition）
 * —— 全局类型扩展，供 command-box.tsx 语音输入使用
 */

interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string;
  readonly message: string;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

/** SpeechRecognition 构造函数（浏览器全局变量） */
declare const SpeechRecognition: {
  new (): SpeechRecognition;
};

/** webkit 前缀兼容 */
declare const webkitSpeechRecognition: {
  new (): SpeechRecognition;
};
