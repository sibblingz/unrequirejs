BEGIN { PRINT=1 }

# Don't print lines between and including @{{{ and @}}}
/@{{{/ { PRINT=0 }
{ if (PRINT == 1) { print } }
/@}}}/ { PRINT=1 }
