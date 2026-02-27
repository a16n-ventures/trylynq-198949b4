// Update ProtectedRoute component to include updated route protection logic
import React from 'react';
import { Route, Redirect } from 'react-router-dom';

const ProtectedRoute = ({ component: Component, isAppPage, requireInterests, ...rest }) => {
    return (
        <Route
            {...rest}
            render={props => {
                if (!isAppPage && requireInterests) {
                    // Add your logic here to ensure interests are looked into
                    return <Redirect to="/interests" />;
                }
                return <Component {...props} />;
            }}
        />
    );
};

export default ProtectedRoute;