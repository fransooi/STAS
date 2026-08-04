10 ' Petit tableau et sous-programmes, à l'ancienne
20 dim t(5)
30 for i=0 to 5
40 t(i)=i*i
50 next i
60 gosub 100
70 for i=0 to 5
80 print "t(";i;") = ";t(i)
90 next i
95 end
100 print "--- les carrés ---"
110 return
