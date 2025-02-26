import { useState, useEffect } from 'react';
import { usePersonaStore } from '../store/personaStore';
import { useApiKeyStore } from '../store/apiKeyStore';
import { extractPageContent } from '../utils/pageContentExtractor';
import { generatePersona, chatWithPersona } from '../services/openaiService';
import ChatInterface from './components/ChatInterface';
import PersonaCreator from './components/PersonaCreator';
import ApiKeySettings from './components/ApiKeySettings';
import { FaCog } from 'react-icons/fa';
import { initializeApiKey } from '../store/apiKeyStore';

function App() {
  const { persona, messages, isLoading, error, setPersona, addMessage, setIsLoading, setError } = usePersonaStore();
  const { apiKey, isKeyValid } = useApiKeyStore();
  const [pageContent, setPageContent] = useState<string>('');
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    // API 키 초기화
    initializeApiKey();
  }, []);

  const fetchPageContent = async (): Promise<string> => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab.id) {
        const content = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: extractPageContent,
        });

        const extractedContent = content[0].result ?? '';
        return extractedContent;
      }
      throw new Error('활성 탭을 찾을 수 없습니다.');
    } catch (err) {
      console.error('페이지 콘텐츠 추출 오류:', err);
      throw new Error('페이지 콘텐츠를 가져올 수 없습니다.');
    }
  };

  const handleCreatePersona = async () => {
    if (!apiKey) {
      setError('API 키를 먼저 설정해주세요.');
      setShowSettings(true);
      return;
    }

    setIsLoading(true);
    
    try {
      // 페르소나 생성 버튼 클릭 시 페이지 콘텐츠 가져오기
      const content = await fetchPageContent();
      setPageContent(content);
      
      if (!content || content.trim().length < 50) {
        setError('페이지 콘텐츠가 충분하지 않습니다.');
        setIsLoading(false);
        return;
      }

      const newPersona = await generatePersona(content);
      setPersona(newPersona);
      addMessage({
        role: 'assistant',
        content: `안녕하세요! 저는 이 글의 작가입니다. ${newPersona.substring(0, 100)}... 어떤 것이 궁금하신가요?`,
      });
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('페르소나 생성 중 오류가 발생했습니다.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendMessage = async (message: string) => {
    if (!message.trim() || !persona) return;

    addMessage({ role: 'user', content: message });
    setIsLoading(true);

    try {
      // 이전 대화 내용을 포함하여 API 호출
      const response = await chatWithPersona({
        prompt: message,
        pageContent,
        persona,
        messages: messages, // 이전 대화 내용 전달
      });

      addMessage({ role: 'assistant', content: response });
    } catch (err) {
      setError('메시지 전송 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className='min-h-screen flex flex-col bg-gray-100 w-[400px] h-[600px]'>
      <header className='bg-blue-600 text-white p-4 shadow-md flex justify-between items-center'>
        <div>
          <h1 className='text-xl font-bold'>Persona-L</h1>
          <p className='text-sm opacity-80'>작가의 마음으로 글을 이해하세요</p>
        </div>
        <button
          onClick={() => setShowSettings(true)}
          className='p-2 rounded-full hover:bg-blue-700 transition-colors'
          title='API 키 설정'
        >
          <FaCog />
        </button>
      </header>

      <main className='flex-1 overflow-hidden flex flex-col'>
        {error && (
          <div className='bg-red-100 border-l-4 border-red-500 text-red-700 p-4 m-2'>
            <p>{error}</p>
          </div>
        )}

        {!apiKey && (
          <div className='bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-4 m-2'>
            <p>API 키를 설정해주세요.</p>
            <button onClick={() => setShowSettings(true)} className='mt-2 text-blue-600 hover:underline'>
              API 키 설정하기
            </button>
          </div>
        )}

        {!persona ? (
          <PersonaCreator onCreatePersona={handleCreatePersona} isLoading={isLoading} />
        ) : (
          <ChatInterface messages={messages} isLoading={isLoading} onSendMessage={handleSendMessage} />
        )}
      </main>

      {showSettings && <ApiKeySettings onClose={() => setShowSettings(false)} />}
    </div>
  );
}

export default App;
