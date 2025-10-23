import React from 'react';

export function Button({ 
  children, 
  onClick, 
  disabled = false, 
  loading = false,
  variant = 'primary',
  className = '',
  ...props 
}) {
  const baseStyles = 'w-full py-3 px-6 rounded-xl font-semibold transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center';
  
  const variants = {
    primary: 'bg-blue-500 hover:bg-blue-600 text-white shadow-lg hover:shadow-xl transform hover:scale-[1.02]',
    secondary: 'bg-gray-600 hover:bg-gray-700 text-white',
    danger: 'bg-red-500 hover:bg-red-600 text-white'
  };

  return (
    <button
      className={`${baseStyles} ${variants[variant]} ${className}`}
      onClick={onClick}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <>
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
          Processing...
        </>
      ) : (
        children
      )}
    </button>
  );
}