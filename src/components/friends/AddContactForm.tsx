import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { X, User, Loader2 } from "lucide-react";

interface AddContactFormProps {
  onSubmit: (data: { name: string; username?: string; phone?: string }) => void;
  onCancel: () => void;
  isPending?: boolean;
}

export function AddContactForm({ onSubmit, onCancel, isPending }: AddContactFormProps) {
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [phone, setPhone] = useState("");

  const handleSubmit = () => {
    if (name.trim()) {
      onSubmit({ 
        name: name.trim(), 
        username: username.trim() || undefined, 
        phone: phone.trim() || undefined 
      });
      setName("");
      setUsername("");
      setPhone("");
    }
  };

  return (
    <Card className="border-2 border-primary/20 bg-card">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-sm">Add New Contact</h3>
          <Button variant="ghost" size="sm" onClick={onCancel}>
            <X className="w-4 h-4" />
          </Button>
        </div>
        <Input 
          placeholder="Full Name *" 
          value={name} 
          onChange={(e) => setName(e.target.value)} 
          className="bg-background" 
        />
        <Input 
          type="username" 
          placeholder="Username" 
          value={username} 
          onChange={(e) => setUsername(e.target.value)} 
          className="bg-background" 
        />
        <Input 
          type="tel" 
          placeholder="Phone Number" 
          value={phone} 
          onChange={(e) => setPhone(e.target.value)} 
          className="bg-background" 
        />
        <Button 
          className="w-full bg-gradient-to-r from-blue-500 to-purple-500 text-white" 
          onClick={handleSubmit} 
          disabled={isPending || !name.trim()}
        >
          {isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <User className="w-4 h-4 mr-2" />}
          Save / Connect
        </Button>
      </CardContent>
    </Card>
  );
}
