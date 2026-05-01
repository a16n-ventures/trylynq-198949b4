import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Phone, PhoneOff, Mic, MicOff, Volume2, VolumeX } from 'lucide-react';

interface VoiceCallProps {
  contact: {
    name: string;
    avatar: string;
    status: 'online' | 'away' | 'offline';
  };
  onEndCall: () => void;
  isIncoming?: boolean;
}

const VoiceCall = ({ contact, onEndCall, isIncoming = false }: VoiceCallProps) => {
  const [isConnected, setIsConnected] = useState(!isIncoming);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  
  const callTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const audioChunks = useRef<Blob[]>([]);

  useEffect(() => {
    if (isConnected) {
      callTimer.current = setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);
    }

    return () => {
      if (callTimer.current) {
        clearInterval(callTimer.current);
      }
    };
  }, [isConnected]);

  const formatCallDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleAnswerCall = () => {
    setIsConnected(true);
  };

  const handleEndCall = () => {
    if (callTimer.current) {
      clearInterval(callTimer.current);
    }
    if (mediaRecorder.current && isRecording) {
      mediaRecorder.current.stop();
    }
    onEndCall();
  };

  const toggleMute = () => {
    setIsMuted(!isMuted);
  };

  const toggleSpeaker = () => {
    setIsSpeakerOn(!isSpeakerOn);
  };

  const startVoiceNote = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder.current = new MediaRecorder(stream);
      audioChunks.current = [];

      mediaRecorder.current.ondataavailable = (event) => {
        audioChunks.current.push(event.data);
      };

      mediaRecorder.current.onstop = () => {
        const audioBlob = new Blob(audioChunks.current, { type: 'audio/wav' });
        // Here you would typically send the voice note
        console.log('Voice note recorded:', audioBlob);
      };

      mediaRecorder.current.start();
      setIsRecording(true);
    } catch (error) {
      console.error('Error starting voice recording:', error);
    }
  };

  const stopVoiceNote = () => {
    if (mediaRecorder.current && isRecording) {
      mediaRecorder.current.stop();
      setIsRecording(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-background/95 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-sm mx-auto gradient-card shadow-card border-0">
        <CardContent className="p-8 text-center space-y-6">
          {/* Contact Info */}
          <div className="space-y-4">
            <Avatar className="w-24 h-24 mx-auto">
              <AvatarImage src={contact.avatar} />
              <AvatarFallback className="gradient-primary text-white text-2xl">
                {contact.name.split(' ').map(n => n[0]).join('')}
              </AvatarFallback>
            </Avatar>
            
            <div>
              <h3 className="text-xl font-semibold">{contact.name}</h3>
              <p className="text-muted-foreground">
                {isIncoming && !isConnected ? 'Incoming call...' : 
                 !isConnected ? 'Calling...' : 
                 formatCallDuration(callDuration)}
              </p>
            </div>
          </div>

          {/* Call Controls */}
          {isIncoming && !isConnected ? (
            // Incoming call controls
            <div className="flex items-center justify-center gap-6">
              <Button
                size="lg"
                variant="outline"
                className="w-16 h-16 rounded-full border-destructive text-destructive hover:bg-destructive hover:text-white"
                onClick={handleEndCall}
              >
                <PhoneOff className="w-6 h-6" />
              </Button>
              <Button
                size="lg"
                className="w-16 h-16 rounded-full bg-green-600 hover:bg-green-700 text-white"
                onClick={handleAnswerCall}
              >
                <Phone className="w-6 h-6" />
              </Button>
            </div>
          ) : (
            // Active call controls
            <div className="space-y-4">
              <div className="flex items-center justify-center gap-4">
                <Button
                  variant={isMuted ? "default" : "outline"}
                  size="lg"
                  className="w-12 h-12 rounded-full"
                  onClick={toggleMute}
                >
                  {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                </Button>
                
                <Button
                  variant={isSpeakerOn ? "default" : "outline"}
                  size="lg"
                  className="w-12 h-12 rounded-full"
                  onClick={toggleSpeaker}
                >
                  {isSpeakerOn ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
                </Button>
              </div>
              
              <Button
                size="lg"
                variant="outline"
                className="w-16 h-16 rounded-full border-destructive text-destructive hover:bg-destructive hover:text-white"
                onClick={handleEndCall}
              >
                <PhoneOff className="w-6 h-6" />
              </Button>
            </div>
          )}

          {/* Voice Note Controls */}
          {isConnected && (
            <div className="border-t border-border pt-4">
              <p className="text-sm text-muted-foreground mb-2">Send Voice Note</p>
              <Button
                variant={isRecording ? "destructive" : "outline"}
                size="sm"
                className="w-full"
                onMouseDown={startVoiceNote}
                onMouseUp={stopVoiceNote}
                onTouchStart={startVoiceNote}
                onTouchEnd={stopVoiceNote}
              >
                {isRecording ? (
                  <>
                    <MicOff className="w-4 h-4 mr-2" />
                    Recording... (Release to send)
                  </>
                ) : (
                  <>
                    <Mic className="w-4 h-4 mr-2" />
                    Hold to Record Voice Note
                  </>
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default VoiceCall;