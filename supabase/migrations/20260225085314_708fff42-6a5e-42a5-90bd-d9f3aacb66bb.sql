-- Fix: Allow authenticated users to insert their own payments
CREATE POLICY "Users can insert own payments"
ON public.payments
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Fix: Allow users to update their own payments
CREATE POLICY "Users can update own payments"
ON public.payments
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);
